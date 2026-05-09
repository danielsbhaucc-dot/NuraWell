import { NextResponse } from 'next/server';
import { DeleteObjectCommand, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { createSupabaseForApiRoute } from '../../../../../lib/supabase/api-route-client';
import {
  almogCdnHostname,
  getAlmogAvatarUrl,
  resolveAlmogPublicBaseUrl,
  resolveCdnImagesPrefix,
} from '../../../../../lib/ai/almog-avatar';
import {
  ALMOG_AVATAR_LEGACY_KEYS,
  ALMOG_AVATAR_OBJECT_KEY,
  getR2Client,
  r2ImageBucketName,
} from '../../../../../lib/storage/r2-almog';

/** Client sends pre-compressed WebP; keep margin under Vercel ~4.5MB body limit. */
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

export const runtime = 'nodejs';
export const maxDuration = 60;

function isWebpBuffer(buf: Buffer): boolean {
  if (buf.length < 12) return false;
  return buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP';
}

async function assertAdmin(request: Request) {
  const { supabase, user, authError } = await createSupabaseForApiRoute(request);
  if (authError || !user) return { ok: false as const, status: 401 };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await (supabase as any).from('profiles').select('role').eq('id', user.id).single();
  if (!profile || profile.role !== 'admin') return { ok: false as const, status: 403 };
  return { ok: true as const };
}

export async function GET(request: Request) {
  const auth = await assertAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: auth.status });

  const cdnBase = resolveAlmogPublicBaseUrl();
  const avatar_url = cdnBase ? getAlmogAvatarUrl() : null;

  return NextResponse.json({
    avatar_url,
    cdn_base: cdnBase ?? null,
    cdn_hostname: almogCdnHostname(),
    public_object_path: `${resolveCdnImagesPrefix()}/${ALMOG_AVATAR_OBJECT_KEY}`,
    is_configured: Boolean(r2ImageBucketName() && cdnBase),
    r2_bucket_configured: Boolean(r2ImageBucketName()),
    expected_key: ALMOG_AVATAR_OBJECT_KEY,
  });
}

export async function POST(request: Request) {
  const auth = await assertAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: auth.status });

  try {
    const bucket = r2ImageBucketName();
    if (!bucket) {
      return NextResponse.json(
        {
          error: 'חסרה הגדרת אחסון תמונות בשרת. פנה למנהל המערכת.',
        },
        { status: 500 }
      );
    }

    const form = await request.formData();
    const file = form.get('file');
    const originalBytesRaw = form.get('original_bytes');
    const originalBytesParsed =
      typeof originalBytesRaw === 'string' ? Number.parseInt(originalBytesRaw, 10) : NaN;

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'לא נבחר קובץ' }, { status: 400 });
    }
    if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: 'הקובץ גדול מדי אחרי הכנה. נסה תמונה קטנה יותר.' },
        { status: 400 }
      );
    }

    const buf = Buffer.from(await file.arrayBuffer());
    if (!isWebpBuffer(buf)) {
      return NextResponse.json(
        { error: 'הקובץ חייב להיות WebP לאחר הכנה בדפדפן. רענן ונסה שוב.' },
        { status: 400 }
      );
    }

    const originalForStats =
      Number.isFinite(originalBytesParsed) && originalBytesParsed > 0 ? originalBytesParsed : file.size;

    const s3 = getR2Client();

    for (const key of ALMOG_AVATAR_LEGACY_KEYS) {
      try {
        await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
      } catch {
        /* ignore missing */
      }
    }

    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: ALMOG_AVATAR_OBJECT_KEY,
        Body: buf,
        ContentType: 'image/webp',
        CacheControl: 'public, max-age=31536000, immutable',
      })
    );

    // Verify write succeeded in the exact key/bucket the UI expects.
    await s3.send(
      new HeadObjectCommand({
        Bucket: bucket,
        Key: ALMOG_AVATAR_OBJECT_KEY,
      })
    );

    const version = Date.now().toString();
    const cdnBase = resolveAlmogPublicBaseUrl();
    const avatar_url = cdnBase ? getAlmogAvatarUrl(version) : null;

    return NextResponse.json({
      ok: true,
      avatar_url,
      cdn_base: cdnBase ?? null,
      cdn_hostname: almogCdnHostname(),
      public_object_path: `${resolveCdnImagesPrefix()}/${ALMOG_AVATAR_OBJECT_KEY}`,
      cdn_configured: Boolean(cdnBase),
      bucket,
      object_key: ALMOG_AVATAR_OBJECT_KEY,
      original_bytes: originalForStats,
      optimized_bytes: buf.length,
      saved_percent: Math.max(0, Math.round((1 - buf.length / Math.max(1, originalForStats)) * 100)),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const friendly =
      msg.includes('credentials') || msg.includes('חסרים')
        ? msg
        : 'העלאה נכשלה. אם זה חוזר — בדוק הגדרות אחסון ומפתחות בשרת.';
    console.error('[almog-avatar POST]', msg);
    const payload: { error: string; detail?: string } = { error: friendly };
    if (process.env.NODE_ENV !== 'production') {
      payload.detail = msg;
    }
    return NextResponse.json(payload, { status: 500 });
  }
}
