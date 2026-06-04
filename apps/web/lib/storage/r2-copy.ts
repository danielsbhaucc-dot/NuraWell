import { CopyObjectCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getR2Client } from './r2-almog';

/** העתקת אובייקט בתוך אותו דלי R2. */
export async function copyR2Object(params: {
  bucket: string;
  fromKey: string;
  toKey: string;
  contentType?: string;
  cacheControl?: string;
}): Promise<void> {
  const s3 = getR2Client();
  try {
    await s3.send(
      new CopyObjectCommand({
        Bucket: params.bucket,
        Key: params.toKey,
        CopySource: `${params.bucket}/${params.fromKey}`,
        ContentType: params.contentType,
        CacheControl: params.cacheControl,
        MetadataDirective: 'REPLACE',
      })
    );
  } catch {
    const got = await s3.send(new GetObjectCommand({ Bucket: params.bucket, Key: params.fromKey }));
    const body = await got.Body?.transformToByteArray();
    if (!body) throw new Error('COPY_FAILED');
    await s3.send(
      new PutObjectCommand({
        Bucket: params.bucket,
        Key: params.toKey,
        Body: body,
        ContentType: params.contentType ?? got.ContentType,
        CacheControl: params.cacheControl,
      })
    );
  }
}
