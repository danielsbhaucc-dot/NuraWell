import { NextResponse } from 'next/server';
import { HeadObjectCommand } from '@aws-sdk/client-s3';
import { createClient } from '@/lib/supabase/server';
import { getPublicCdnImageUrl } from '@/lib/cdn/public-images';
import { getR2Client, r2ImageBucketName } from '@/lib/storage/r2-almog';

/**
 * Shared logic for the public `GET /api/v1/(login|register)-background` routes.
 *
 * Both routes fetch a site_settings row, resolve the R2 object key,
 * check R2 for the actual object, and return { url, has_custom, credit }.
 */
export async function resolveSiteBackgroundResponse(opts: {
  keyColumn: string;
  creditColumn: string;
  defaultObjectKey: string;
}): Promise<NextResponse> {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await supabase
    .from('site_settings')
    .select(`${opts.keyColumn}, ${opts.creditColumn}`)
    .eq('id', 1)
    .maybeSingle();

  const row = data as Record<string, unknown> | null;
  const key =
    (typeof row?.[opts.keyColumn] === 'string' && row[opts.keyColumn]) ||
    opts.defaultObjectKey;
  const credit = row?.[opts.creditColumn] ?? null;

  const bucket = r2ImageBucketName();
  let version = '0';
  let hasCustom = false;

  if (bucket) {
    try {
      const s3 = getR2Client();
      const head = await s3.send(
        new HeadObjectCommand({ Bucket: bucket, Key: key as string })
      );
      version = String(head.LastModified?.getTime() ?? '1');
      hasCustom = true;
    } catch {
      hasCustom = false;
    }
  }

  const url = getPublicCdnImageUrl(key as string, version);

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
