import { NextResponse } from 'next/server';
import { HeadObjectCommand } from '@aws-sdk/client-s3';
import { requireOpsApiAdmin } from '@/lib/api/require-ops-api-admin';
import { readJsonBody } from '@/lib/api/json-request';
import { createAdminClient } from '@/lib/supabase/admin';
import { buildPublicUrlForUpload } from '@/lib/cdn/public-media';
import { bucketForKind, buildMediaObjectKey } from '@/lib/media/media-asset-keys';
import { nurawellPlaylistFromVideoId } from '@/lib/journey/bunny-pull';
import {
  mediaCompleteUploadSchema,
  mediaCompleteVideoSchema,
} from '@/lib/validation/media-asset';
import { getR2Client, r2BucketNameForMediaBucket } from '@/lib/storage/r2-almog';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(request: Request) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;

  const videoParsed = mediaCompleteVideoSchema.safeParse(raw.value);
  if (videoParsed.success) {
    return completeVideo(auth.user.id, videoParsed.data);
  }

  const uploadParsed = mediaCompleteUploadSchema.safeParse(raw.value);
  if (!uploadParsed.success) {
    return NextResponse.json({ error: 'פרטי השלמה לא תקינים' }, { status: 400 });
  }

  return completeUpload(auth.user.id, uploadParsed.data);
}

async function completeUpload(
  userId: string,
  data: ReturnType<typeof mediaCompleteUploadSchema.parse>
) {
  const bucketLabel = bucketForKind(data.kind);
  const bucket = r2BucketNameForMediaBucket(bucketLabel);
  if (!bucket) {
    return NextResponse.json({ error: `חסרה הגדרת דלי ${bucketLabel}.` }, { status: 500 });
  }

  const expectedKey = buildMediaObjectKey({
    kind: data.kind,
    assetId: data.asset_id,
    contentType: data.mime_type,
    originalFilename: data.original_filename,
  });
  if (data.object_key !== expectedKey) {
    return NextResponse.json({ error: 'מפתח האובייקט לא תואם' }, { status: 400 });
  }

  try {
    const s3 = getR2Client();
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: data.object_key }));
  } catch (e) {
    console.error('[media complete] R2 head failed', e);
    return NextResponse.json({ error: 'הקובץ עדיין לא נמצא ב-R2. נסה שוב.' }, { status: 409 });
  }

  const publicUrl = buildPublicUrlForUpload({ kind: data.kind, objectKey: data.object_key });
  const admin = createAdminClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: row, error } = await admin
    .from('media_assets')
    .insert({
      id: data.asset_id,
      kind: data.kind,
      file_subtype: data.file_subtype ?? (data.kind === 'file' ? 'other' : null),
      bucket: bucketLabel,
      object_key: data.object_key,
      public_url: publicUrl,
      title: data.title ?? data.original_filename ?? 'ללא שם',
      original_filename: data.original_filename ?? null,
      mime_type: data.mime_type,
      size_bytes: data.size_bytes,
      original_bytes: data.original_bytes ?? null,
      width: data.width ?? null,
      height: data.height ?? null,
      duration_seconds: data.duration_seconds ?? null,
      alt_text: data.alt_text ?? null,
      folder: data.folder ?? null,
      source: data.source,
      credit: data.credit ?? {},
      created_by: userId,
    })
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ...row, url: publicUrl });
}

async function completeVideo(
  userId: string,
  data: ReturnType<typeof mediaCompleteVideoSchema.parse>
) {
  let externalUrl = data.external_url?.trim() ?? null;
  const externalId = data.external_id?.trim() ?? null;

  if (!externalUrl && externalId) {
    externalUrl = nurawellPlaylistFromVideoId(externalId);
  }

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: row, error } = await admin
    .from('media_assets')
    .insert({
      kind: 'video',
      provider: 'bunny',
      external_id: externalId,
      external_url: externalUrl,
      public_url: externalUrl,
      title: data.title,
      alt_text: data.alt_text ?? null,
      folder: data.folder ?? null,
      source: data.source,
      credit: data.credit ?? {},
      created_by: userId,
    })
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ...row, url: externalUrl });
}
