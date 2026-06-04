import { HeadObjectCommand } from '@aws-sdk/client-s3';
import { copyR2Object } from './r2-copy';
import { getR2Client, r2ImageBucketName } from './r2-almog';

const WEBP_CACHE = 'public, max-age=31536000, immutable';

/** העתקת WebP ממפתח בספריית מדיה למפתח יעד (אותו דלי תמונות). */
export async function copyImageSourceToKey(params: {
  sourceObjectKey: string;
  destObjectKey: string;
}): Promise<{ optimizedBytes: number }> {
  const bucket = r2ImageBucketName();
  if (!bucket) throw new Error('NO_IMAGE_BUCKET');

  const source = params.sourceObjectKey.replace(/^\/+/, '');
  const dest = params.destObjectKey.replace(/^\/+/, '');
  if (!source || source.includes('..') || !dest || dest.includes('..')) {
    throw new Error('INVALID_KEY');
  }

  const s3 = getR2Client();
  const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: source }));
  const size = head.ContentLength ?? 0;
  if (size <= 0 || size > 2 * 1024 * 1024) {
    throw new Error('SOURCE_TOO_LARGE');
  }

  await copyR2Object({
    bucket,
    fromKey: source,
    toKey: dest,
    contentType: head.ContentType ?? 'image/webp',
    cacheControl: WEBP_CACHE,
  });

  return { optimizedBytes: size };
}

export async function parseSourceObjectKeyFromRequest(
  request: Request
): Promise<string | null> {
  const ct = request.headers.get('content-type') ?? '';
  if (!ct.includes('application/json')) return null;
  try {
    const body = (await request.json()) as { source_object_key?: string };
    const key = body.source_object_key?.trim();
    return key || null;
  } catch {
    return null;
  }
}
