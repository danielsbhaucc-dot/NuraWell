import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getPublicCdnAudioUrl } from '@/lib/cdn/public-audio';
import { getR2Client, r2AudioBucketName } from '@/lib/storage/r2-almog';

export async function uploadTtsMp3ToR2(params: {
  objectKey: string;
  buffer: Buffer;
}): Promise<{ publicUrl: string | null; sizeBytes: number }> {
  const bucket = r2AudioBucketName();
  if (!bucket) {
    throw new Error('חסר R2_AUDIO_BUCKET_NAME');
  }

  const s3 = getR2Client();
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: params.objectKey,
      Body: params.buffer,
      ContentType: 'audio/mpeg',
      CacheControl: 'public, max-age=31536000, immutable',
    })
  );

  return {
    publicUrl: getPublicCdnAudioUrl(params.objectKey),
    sizeBytes: params.buffer.byteLength,
  };
}

export async function deleteTtsFromR2(objectKey: string): Promise<void> {
  const bucket = r2AudioBucketName();
  if (!bucket) return;

  const s3 = getR2Client();
  await s3.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: objectKey,
    })
  );
}
