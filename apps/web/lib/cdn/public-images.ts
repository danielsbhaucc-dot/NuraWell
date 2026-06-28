import { resolveAlmogPublicBaseUrl, resolveCdnImagesPrefix } from '../ai/almog-avatar';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getR2Client, r2ImageBucketName } from '@/lib/storage/r2-almog';

/** מפתח אובייקט WebP לתמונת רקע של תחנה במסע. */
export function journeyStationCoverObjectKey(stationId: string): string {
  return `journey/stations/${stationId}.webp`;
}

/** URL ציבורי מלא לתמונה ב-CDN (Worker /images/*). */
export function getPublicCdnImageUrl(objectKey: string, cacheBuster?: string): string | null {
  const base = resolveAlmogPublicBaseUrl();
  if (!base) return null;
  const key = objectKey.replace(/^\/+/, '');
  const url = `${base}${resolveCdnImagesPrefix()}/${key}`;
  return cacheBuster ? `${url}?v=${encodeURIComponent(cacheBuster)}` : url;
}

/** מחיקת תמונה מ-R2 */
export async function deleteImageFromR2(objectKey: string): Promise<void> {
  const bucket = r2ImageBucketName();
  if (!bucket) return;

  const s3 = getR2Client();
  await s3.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: objectKey,
    })
  );
}
