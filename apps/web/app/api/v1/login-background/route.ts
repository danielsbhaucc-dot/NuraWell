import { NextResponse } from 'next/server';
import { HeadObjectCommand } from '@aws-sdk/client-s3';
import { createClient } from '@/lib/supabase/server';
import { getPublicCdnImageUrl } from '@/lib/cdn/public-images';
import { getR2Client, r2ImageBucketName } from '@/lib/storage/r2-almog';
import { LOGIN_BACKGROUND_OBJECT_KEY } from '@/lib/storage/login-background';

export const runtime = 'nodejs';

export async function GET() {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('site_settings')
    .select('login_background_key, login_background_credit')
    .eq('id', 1)
    .maybeSingle();

  const key =
    (data as { login_background_key?: string | null } | null)?.login_background_key ??
    LOGIN_BACKGROUND_OBJECT_KEY;
  const credit = (data as { login_background_credit?: unknown } | null)?.login_background_credit ?? null;

  const bucket = r2ImageBucketName();
  let version = '0';
  let hasCustom = false;

  if (bucket) {
    try {
      const s3 = getR2Client();
      const head = await s3.send(
        new HeadObjectCommand({ Bucket: bucket, Key: key })
      );
      version = String(head.LastModified?.getTime() ?? '1');
      hasCustom = true;
    } catch {
      hasCustom = false;
    }
  }

  const url = getPublicCdnImageUrl(key, version);

  return NextResponse.json(
    {
      url,
      has_custom: hasCustom && Boolean(url),
      credit,
      object_key: key,
    },
    {
      headers: {
        'Cache-Control': hasCustom
          ? 'public, max-age=3600, stale-while-revalidate=86400'
          : 'public, max-age=60',
      },
    }
  );
}
