import { NextResponse } from 'next/server';
import { DeleteObjectCommand, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { requireOpsApiAdmin } from '@/lib/api/require-ops-api-admin';
import { almogCdnHostname, resolveAlmogPublicBaseUrl, resolveCdnImagesPrefix } from '@/lib/ai/almog-avatar';
import { getR2Client, r2ImageBucketName } from '@/lib/storage/r2-almog';
import {
  copyImageSourceToKey,
  parseSourceObjectKeyFromRequest,
} from '@/lib/storage/apply-source-image';
import { isMentorId, MENTORS, mentorLegacyKeys } from '@/lib/mentors/registry';
import { getMentorAvatarUrl } from '@/lib/mentors/avatar-url';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

type RouteContext = { params: Promise<{ mentorId: string }> };

function isWebpBuffer(buf: Buffer): boolean {
  if (buf.length < 12) return false;
  return buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP';
}

export async function GET(request: Request, context: RouteContext) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

  const { mentorId } = await context.params;
  if (!isMentorId(mentorId)) {
    return NextResponse.json({ error: 'מנטור לא נמצא' }, { status: 404 });
  }

  const mentor = MENTORS[mentorId];
  const cdnBase = resolveAlmogPublicBaseUrl();

  return NextResponse.json({
    mentor_id: mentorId,
    name: mentor.name,
    avatar_url: cdnBase ? getMentorAvatarUrl(mentor) : null,
    cdn_base: cdnBase ?? null,
    cdn_hostname: almogCdnHostname(),
    public_object_path: `${resolveCdnImagesPrefix()}/${mentor.objectKey}`,
    is_configured: Boolean(r2ImageBucketName() && cdnBase),
    r2_bucket_configured: Boolean(r2ImageBucketName()),
    expected_key: mentor.objectKey,
  });
}

export async function POST(request: Request, context: RouteContext) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

  const { mentorId } = await context.params;
  if (!isMentorId(mentorId)) {
    return NextResponse.json({ error: 'מנטור לא נמצא' }, { status: 404 });
  }

  const mentor = MENTORS[mentorId];

  try {
    const bucket = r2ImageBucketName();
    if (!bucket) {
      return NextResponse.json({ error: 'חסרה הגדרת אחסון תמונות בשרת.' }, { status: 500 });
    }

    const sourceKey = await parseSourceObjectKeyFromRequest(request);
    let originalForStats = 0;
    let optimizedBytes = 0;

    const s3 = getR2Client();
    for (const key of mentorLegacyKeys(mentorId)) {
      try {
        await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
      } catch {
        /* ignore */
      }
    }

    if (sourceKey) {
      const copied = await copyImageSourceToKey({
        sourceObjectKey: sourceKey,
        destObjectKey: mentor.objectKey,
      });
      originalForStats = copied.optimizedBytes;
      optimizedBytes = copied.optimizedBytes;
    } else {
      const form = await request.formData();
      const file = form.get('file');
      const originalBytesRaw = form.get('original_bytes');
      const originalBytesParsed =
        typeof originalBytesRaw === 'string' ? Number.parseInt(originalBytesRaw, 10) : NaN;

      if (!(file instanceof File)) {
        return NextResponse.json({ error: 'לא נבחר קובץ' }, { status: 400 });
      }
      if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) {
        return NextResponse.json({ error: 'הקובץ גדול מדי אחרי הכנה.' }, { status: 400 });
      }

      const buf = Buffer.from(await file.arrayBuffer());
      if (!isWebpBuffer(buf)) {
        return NextResponse.json({ error: 'הקובץ חייב להיות WebP.' }, { status: 400 });
      }

      originalForStats =
        Number.isFinite(originalBytesParsed) && originalBytesParsed > 0 ? originalBytesParsed : file.size;
      optimizedBytes = buf.length;

      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: mentor.objectKey,
          Body: buf,
          ContentType: 'image/webp',
          CacheControl: 'public, max-age=31536000, immutable',
        })
      );
    }

    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: mentor.objectKey }));

    const version = Date.now().toString();
    const cdnBase = resolveAlmogPublicBaseUrl();

    return NextResponse.json({
      ok: true,
      mentor_id: mentorId,
      name: mentor.name,
      avatar_url: cdnBase ? getMentorAvatarUrl(mentor, version) : null,
      cdn_base: cdnBase ?? null,
      cdn_hostname: almogCdnHostname(),
      object_key: mentor.objectKey,
      original_bytes: originalForStats,
      optimized_bytes: optimizedBytes,
      saved_percent: Math.max(0, Math.round((1 - optimizedBytes / Math.max(1, originalForStats)) * 100)),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[mentor-avatar POST]', mentorId, msg);
    return NextResponse.json({ error: 'העלאה נכשלה.' }, { status: 500 });
  }
}
