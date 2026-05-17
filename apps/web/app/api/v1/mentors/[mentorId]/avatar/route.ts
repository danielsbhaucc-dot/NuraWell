import { NextResponse } from 'next/server';
import { HeadObjectCommand } from '@aws-sdk/client-s3';
import { resolveAlmogPublicBaseUrl, resolveCdnImagesPrefix, almogCdnHostname } from '@/lib/ai/almog-avatar';
import { getR2Client, r2ImageBucketName } from '@/lib/storage/r2-almog';
import { isMentorId, MENTORS } from '@/lib/mentors/registry';
import { getMentorAvatarFallback } from '@/lib/mentors/avatar-url';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ mentorId: string }> };

function cdnUrl(objectKey: string, v: string): string | null {
  const base = resolveAlmogPublicBaseUrl();
  if (!base) return null;
  return `${base}${resolveCdnImagesPrefix()}/${objectKey}?v=${encodeURIComponent(v)}`;
}

export async function GET(_request: Request, context: RouteContext) {
  const { mentorId } = await context.params;
  if (!isMentorId(mentorId)) {
    return NextResponse.json({ error: 'מנטור לא נמצא' }, { status: 404 });
  }

  const mentor = MENTORS[mentorId];
  const base = resolveAlmogPublicBaseUrl();
  const cdn_hostname = almogCdnHostname();

  if (!base) {
    return NextResponse.json(
      {
        url: getMentorAvatarFallback(mentor),
        has_custom: false,
        name: mentor.name,
        cdn_hostname: null,
        cdn_configured: false,
      },
      { headers: { 'Cache-Control': 'public, max-age=300' } }
    );
  }

  const bucket = r2ImageBucketName();
  if (!bucket) {
    return NextResponse.json(
      {
        url: cdnUrl(mentor.objectKey, '0'),
        has_custom: false,
        name: mentor.name,
        cdn_hostname,
        cdn_configured: true,
      },
      { headers: { 'Cache-Control': 'public, max-age=300' } }
    );
  }

  try {
    const s3 = getR2Client();
    const head = await s3.send(
      new HeadObjectCommand({ Bucket: bucket, Key: mentor.objectKey })
    );
    const v = String(head.LastModified?.getTime() ?? head.ETag?.replace(/"/g, '') ?? '1');
    return NextResponse.json(
      {
        url: cdnUrl(mentor.objectKey, v),
        has_custom: true,
        name: mentor.name,
        cdn_hostname,
        cdn_configured: true,
      },
      { headers: { 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' } }
    );
  } catch (e: unknown) {
    const err = e as { name?: string; $metadata?: { httpStatusCode?: number } };
    const notFound =
      err.name === 'NotFound' ||
      err.name === 'NoSuchKey' ||
      err.$metadata?.httpStatusCode === 404;
    if (notFound) {
      return NextResponse.json(
        {
          url: getMentorAvatarFallback(mentor),
          has_custom: false,
          name: mentor.name,
          cdn_hostname,
          cdn_configured: true,
        },
        { headers: { 'Cache-Control': 'public, max-age=300' } }
      );
    }
    console.error('[mentor-avatar GET]', mentorId, e);
    return NextResponse.json(
      {
        url: getMentorAvatarFallback(mentor),
        has_custom: false,
        name: mentor.name,
        cdn_hostname,
        cdn_configured: true,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
