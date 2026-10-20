import 'server-only';
/**
 * Private evidence image storage. Primary: dedicated EU-jurisdiction R2 bucket (never public,
 * bucket lock retention on consent/). Fallback (if the bucket is unreachable with the app's
 * keys): encrypted, append-only DB table. Either way the SHA-256 in the signed record decides.
 */
import { randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { encryptString, decryptString } from '@/lib/crypto/pii';
import { sha256Hex } from './evidence-crypto';

function legalBucket() {
  return process.env.R2_LEGAL_BUCKET_NAME?.trim() || null;
}

async function r2Client() {
  const { S3Client } = await import('@aws-sdk/client-s3');
  const { getR2Credentials } = await import('@/lib/storage/r2-almog');
  const { accountId, accessKeyId, secretAccessKey } = getR2Credentials();
  const j = process.env.R2_LEGAL_JURISDICTION?.trim();
  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.${j ? `${j}.` : ''}r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
}

export async function storeEvidenceImage(admin: SupabaseClient, userId: string, sha: string, bytes: Buffer): Promise<{ storage: string; key: string } | null> {
  const bucket = legalBucket();
  if (bucket) {
    try {
      const { PutObjectCommand } = await import('@aws-sdk/client-s3');
      const key = `consent/${sha256Hex(userId).slice(0, 16)}/${randomBytes(16).toString('hex')}.webp`;
      const c = await r2Client();
      await c.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: bytes, ContentType: 'image/webp', Metadata: { sha256: sha } }));
      return { storage: `r2:${bucket}`, key };
    } catch (e) {
      console.warn('[consent-evidence] r2 store failed, using db', { error: e instanceof Error ? e.name : 'error' });
    }
  }
  const { error } = await admin.from('consent_evidence_blobs').insert({ sha256: sha, user_id: userId, mime: 'image/webp', bytes_enc: encryptString(bytes.toString('base64'), userId) });
  if (error && error.code !== '23505') return null;
  return { storage: 'db', key: sha };
}

export async function loadEvidenceImage(admin: SupabaseClient, userId: string, storage: string | null, key: string | null): Promise<Buffer | null> {
  if (!storage || !key) return null;
  if (storage === 'db') {
    const { data } = await admin.from('consent_evidence_blobs').select('bytes_enc').eq('sha256', key).eq('user_id', userId).maybeSingle();
    const enc = (data as { bytes_enc?: string } | null)?.bytes_enc;
    return enc ? Buffer.from(decryptString(enc, userId), 'base64') : null;
  }
  if (storage.startsWith('r2:')) {
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');
    const c = await r2Client();
    const r = await c.send(new GetObjectCommand({ Bucket: storage.slice(3), Key: key }));
    const arr = await r.Body?.transformToByteArray();
    return arr ? Buffer.from(arr) : null;
  }
  return null;
}
