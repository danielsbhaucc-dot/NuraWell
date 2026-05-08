import { NextResponse } from 'next/server';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { createSupabaseForApiRoute } from '../../../../../lib/supabase/api-route-client';
import { getAlmogAvatarUrl } from '../../../../../lib/ai/almog-avatar';

/** Vercel serverless body limit is ~4.5MB; multipart overhead needs margin. */
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const OUTPUT_WIDTH = 900;
const OUTPUT_QUALITY = 84;
/** Single canonical key — extensionless; R2 serves correct Content-Type. */
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

async function optimizeImageWebP(input: Buffer): Promise<Buffer> {
  const sharpModule = await import('sharp');
  const sharpFn = sharpModule.default;
  return sharpFn(input)
    .rotate()
    .resize({ width: OUTPUT_WIDTH, withoutEnlargement: true })
    .webp({ quality: OUTPUT_QUALITY, effort: 6 })
    .toBuffer();
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
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'לא נבחר קובץ' }, { status: 400 });
    }
    if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: 'הקובץ גדול מדי (עד כ־4MB). נסה גרסה קטנה יותר.' },
        { status: 400 }
      );
    }

    const input = Buffer.from(await file.arrayBuffer());

    let webp: Buffer;
    try {
      webp = await optimizeImageWebP(input);
    } catch (e) {
      console.error('[almog-avatar] sharp failed', e);
      return NextResponse.json(
        {
          error:
            'לא הצלחנו לדחוס את התמונה בשרת. נסה קובץ אחר (JPEG/PNG) או גרסה קטנה יותר, ואם זה חוזר — בדוק לוגי Deploy.',
        },
        { status: 502 }
      );
    }

    const s3 = getR2Client();
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: OBJECT_KEY,
        Body: webp,
        ContentType: 'image/webp',
        CacheControl: 'public, max-age=31536000, immutable',
      })
    );

    const version = Date.now().toString();
    return NextResponse.json({
      ok: true,
      avatar_url: getAlmogAvatarUrl(version),
      original_bytes: file.size,
      optimized_bytes: webp.length,
      saved_percent: Math.max(0, Math.round((1 - webp.length / Math.max(1, file.size)) * 100)),
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
