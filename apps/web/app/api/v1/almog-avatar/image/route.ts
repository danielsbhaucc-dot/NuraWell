import { NextResponse } from 'next/server';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import {
  ALMOG_AVATAR_OBJECT_KEY,
  getR2Client,
  r2ImageBucketName,
} from '../../../../../lib/storage/r2-almog';

export const runtime = 'nodejs';

/**
 * Serves Almog avatar bytes from R2 through the app origin.
 * Avoids broken public CDN URLs / path mismatches; use ?v= for cache bust (from GET /api/v1/almog-avatar).
 */
export async function GET() {
  const bucket = r2ImageBucketName();
  if (!bucket) {
    return new NextResponse('אחסון תמונות לא מוגדר', { status: 503 });
  }

  try {
    const s3 = getR2Client();
    const out = await s3.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: ALMOG_AVATAR_OBJECT_KEY,
      })
    );
    if (!out.Body) {
      return new NextResponse('ריק', { status: 404 });
    }
    const bytes = await out.Body.transformToByteArray();
    const ct = out.ContentType?.trim() || 'image/webp';
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        'Content-Type': ct,
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
      },
    });
  } catch (e: unknown) {
    const err = e as { name?: string; $metadata?: { httpStatusCode?: number } };
    const notFound =
      err.name === 'NotFound' ||
      err.name === 'NoSuchKey' ||
      err.$metadata?.httpStatusCode === 404;
    if (notFound) {
      return new NextResponse('לא נמצא', { status: 404 });
    }
    console.error('[almog-avatar image GET]', e);
    return new NextResponse('שגיאת שרת', { status: 500 });
  }
}
