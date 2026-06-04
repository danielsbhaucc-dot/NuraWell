import { S3Client } from '@aws-sdk/client-s3';

/** Single public object key for Almog profile image (WebP). */
export const ALMOG_AVATAR_OBJECT_KEY = 'almog/avatar.webp';

/** Legacy keys to remove on replace (older uploads / CDN paths). */
export const ALMOG_AVATAR_LEGACY_KEYS = [
  'almog/avatar',
  'almog/avatar.png',
  'almog/avatar.jpg',
  'almog/avatar.jpeg',
] as const;

export function r2ImageBucketName(): string | undefined {
  return (
    process.env.R2_IMAGE_BUCKET_NAME?.trim() ||
    process.env.R2_BUCKET_NAME?.trim() ||
    undefined
  );
}

/** דלי האודיו (מוזיקת רקע לשיעורים) — מאוחסן תחת נתיב ה-Worker /audio/*. */
export function r2AudioBucketName(): string | undefined {
  return process.env.R2_AUDIO_BUCKET_NAME?.trim() || undefined;
}

/** דלי קבצים (PDF, מצגות וכו') — מאוחסן תחת נתיב ה-Worker /files/*. */
export function r2FilesBucketName(): string | undefined {
  return process.env.R2_FILES_BUCKET_NAME?.trim() || undefined;
}

export function r2BucketNameForMediaBucket(bucket: 'images' | 'audio' | 'files'): string | undefined {
  if (bucket === 'images') return r2ImageBucketName();
  if (bucket === 'audio') return r2AudioBucketName();
  return r2FilesBucketName();
}

export function getR2Client(): S3Client {
  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error('חסרים פרטי התחברות לאחסון התמונות (בדוק משתני סביבה)');
  }
  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
}

export function getR2Credentials(): {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
} {
  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error('חסרים פרטי התחברות ל-R2 (בדוק R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY)');
  }
  return { accountId, accessKeyId, secretAccessKey };
}
