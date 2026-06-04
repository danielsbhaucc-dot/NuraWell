import { NextResponse } from 'next/server';
import { requireOpsApiAdmin } from '@/lib/api/require-ops-api-admin';
import { readJsonBody } from '@/lib/api/json-request';
import { mediaPresignSchema } from '@/lib/validation/media-asset';
import {
  bucketForKind,
  buildMediaObjectKey,
  newMediaAssetId,
} from '@/lib/media/media-asset-keys';
import { inferFileSubtype } from '@/lib/media/file-subtype';
import { r2BucketNameForMediaBucket } from '@/lib/storage/r2-almog';
import { createR2PutPresignedUrl } from '@/lib/storage/r2-presign';

export const runtime = 'nodejs';

const MAX_BYTES: Record<string, number> = {
  image: 2 * 1024 * 1024,
  audio: 25 * 1024 * 1024,
  file: 50 * 1024 * 1024,
};

export async function POST(request: Request) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;
  const parsed = mediaPresignSchema.safeParse(raw.value);
  if (!parsed.success) {
    return NextResponse.json({ error: 'פרטי העלאה לא תקינים' }, { status: 400 });
  }

  const { kind, content_type, original_filename, file_subtype } = parsed.data;
  const bucketLabel = bucketForKind(kind);
  const bucket = r2BucketNameForMediaBucket(bucketLabel);
  if (!bucket) {
    return NextResponse.json(
      { error: `חסרה הגדרת דלי ${bucketLabel} בשרת.` },
      { status: 500 }
    );
  }

  const assetId = newMediaAssetId();
  const subtype =
    kind === 'file'
      ? file_subtype ?? inferFileSubtype(original_filename ?? 'file.bin', content_type)
      : undefined;
  const objectKey = buildMediaObjectKey({
    kind,
    assetId,
    contentType: content_type,
    originalFilename: original_filename,
  });

  const uploadUrl = createR2PutPresignedUrl({
    bucket,
    key: objectKey,
    expiresSeconds: 300,
  });

  return NextResponse.json({
    asset_id: assetId,
    object_key: objectKey,
    bucket: bucketLabel,
    upload_url: uploadUrl,
    expires_in: 300,
    max_bytes: MAX_BYTES[kind],
    file_subtype: subtype ?? null,
  });
}
