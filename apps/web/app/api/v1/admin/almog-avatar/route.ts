import { NextResponse } from 'next/server';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { createSupabaseForApiRoute } from '../../../../../lib/supabase/api-route-client';
import { getAlmogAvatarUrl } from '../../../../../lib/ai/almog-avatar';

/** Client sends pre-compressed WebP; keep margin under Vercel ~4.5MB body limit. */
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
const OBJECT_KEY = 'almog/avatar';

export const runtime = 'nodejs';
export const maxDuration = 60;

function imageBucketName(): string | undefined {
  return (
    process.env.R2_IMAGE_BUCKET_NAME?.trim() ||
    process.env.R2_BUCKET_NAME?.trim() ||
    undefined
  );
}

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

function getR2Client(): S3Client {
  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error('חסרים פרטי התחברות לאחסון התמונות (בדוק משתני סביבה)');
  }
  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
}

export async function GET(request: Request) {
  const auth = await assertAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: auth.status });

  return NextResponse.json({
    avatar_url: getAlmogAvatarUrl(),
    is_configured: Boolean(process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL),
    expected_key: OBJECT_KEY,
  });
}

export async function POST(request: Request) {
  const auth = await assertAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: auth.status });

  try {
    const bucket = imageBucketName();
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
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: OBJECT_KEY,
        Body: buf,
        ContentType: 'image/webp',
        CacheControl: 'public, max-age=31536000, immutable',
      })
    );

    const version = Date.now().toString();
    return NextResponse.json({
      ok: true,
      avatar_url: getAlmogAvatarUrl(version),
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
    return NextResponse.json({ error: friendly, detail: msg }, { status: 500 });
  }
}
