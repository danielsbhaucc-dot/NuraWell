import { NextResponse } from 'next/server';
import { HeadObjectCommand } from '@aws-sdk/client-s3';
import { resolveAlmogPublicBaseUrl } from '../../../../lib/ai/almog-avatar';
import {
  ALMOG_AVATAR_OBJECT_KEY,
  getR2Client,
  r2ImageBucketName,
} from '../../../../lib/storage/r2-almog';

export const runtime = 'nodejs';

/**
 * Public: avatar image URL (same-origin proxy) + has_custom from R2 HeadObject.
 */
export async function GET() {
  const bucket = r2ImageBucketName();

  if (!bucket) {
    const base = resolveAlmogPublicBaseUrl();
    if (!base) {
      return NextResponse.json({ url: null, has_custom: false }, { headers: { 'Cache-Control': 'no-store' } });
    }
    return NextResponse.json(
      { url: `${base}/${ALMOG_AVATAR_OBJECT_KEY}`, has_custom: false },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  }

  try {
    const s3 = getR2Client();
    const head = await s3.send(
      new HeadObjectCommand({
        Bucket: bucket,
        Key: ALMOG_AVATAR_OBJECT_KEY,
      })
    );
    const vRaw = head.LastModified?.getTime() ?? head.ETag?.replace(/"/g, '') ?? '1';
    const v = String(vRaw);
    const url = `/api/v1/almog-avatar/image?v=${encodeURIComponent(v)}`;
    return NextResponse.json({ url, has_custom: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e: unknown) {
    const err = e as { name?: string; $metadata?: { httpStatusCode?: number } };
    const notFound =
      err.name === 'NotFound' ||
      err.name === 'NoSuchKey' ||
      err.$metadata?.httpStatusCode === 404;
    if (notFound) {
      return NextResponse.json({ url: null, has_custom: false }, { headers: { 'Cache-Control': 'no-store' } });
    }
    console.error('[almog-avatar public GET]', e);
    const v = String(Date.now());
    return NextResponse.json(
      { url: `/api/v1/almog-avatar/image?v=${encodeURIComponent(v)}`, has_custom: false },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
