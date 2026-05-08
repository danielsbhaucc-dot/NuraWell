import { NextResponse } from 'next/server';
import sharp from 'sharp';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { createSupabaseForApiRoute } from '../../../../../lib/supabase/api-route-client';
import { getAlmogAvatarUrl } from '../../../../../lib/ai/almog-avatar';

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const OUTPUT_WIDTH = 900;
const OUTPUT_QUALITY = 84;
const OBJECT_KEY = 'almog/avatar.webp';

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
    throw new Error('R2 credentials are missing');
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
    const bucket = process.env.R2_BUCKET_NAME?.trim();
    if (!bucket) {
      return NextResponse.json({ error: 'R2_BUCKET_NAME is missing' }, { status: 500 });
    }

    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Missing file' }, { status: 400 });
    }
    if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: 'File too large (max 8MB)' }, { status: 400 });
    }

    const input = Buffer.from(await file.arrayBuffer());
    const optimized = await sharp(input)
      .rotate()
      .resize({ width: OUTPUT_WIDTH, withoutEnlargement: true })
      .webp({ quality: OUTPUT_QUALITY, effort: 6 })
      .toBuffer();

    const s3 = getR2Client();
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: OBJECT_KEY,
        Body: optimized,
        ContentType: 'image/webp',
        CacheControl: 'public, max-age=31536000, immutable',
      })
    );

    const version = Date.now().toString();
    return NextResponse.json({
      ok: true,
      avatar_url: getAlmogAvatarUrl(version),
      original_bytes: file.size,
      optimized_bytes: optimized.length,
      saved_percent: Math.max(0, Math.round((1 - optimized.length / Math.max(1, file.size)) * 100)),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upload failed' },
      { status: 500 }
    );
  }
}

