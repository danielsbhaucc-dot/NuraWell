import 'server-only';
/**
 * Content-addressed evidence blobs for media (original files, license snapshots, receipts).
 * Primary: private legal R2 bucket under media/ (bucket-lock retention). Fallback: encrypted DB row.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { encryptString, decryptString } from '@/lib/crypto/pii';
import { sha256Hex } from '../evidence-crypto';
import { legalBucket, legalR2Client } from '../evidence-storage';

const SCOPE = 'nw-media-evidence';
export const MAX_DB_BLOB = 4_000_000;

export async function storeMediaBlob(admin: SupabaseClient, bytes: Buffer, mime: string): Promise<{ sha256: string; storage: string } | null> {
  const sha = sha256Hex(bytes);
  const { data: existing } = await admin.from('media_evidence_blobs').select('sha256, storage').eq('sha256', sha).maybeSingle();
  if (existing) return existing as { sha256: string; storage: string };
  const bucket = legalBucket();
  let row: Record<string, unknown> | null = null;
  if (bucket) {
    try {
      const { PutObjectCommand } = await import('@aws-sdk/client-s3');
      const key = `media/${sha.slice(0, 2)}/${sha}`;
      const c = await legalR2Client();
      await c.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: bytes, ContentType: mime, Metadata: { sha256: sha } }));
      row = { sha256: sha, mime, bytes: bytes.length, storage: `r2:${bucket}`, storage_key: key, bytes_enc: null };
    } catch (e) {
      console.warn('[media-evidence] r2 store failed, using db', { error: e instanceof Error ? e.name : 'error' });
    }
  }
  if (!row) {
    if (bytes.length > MAX_DB_BLOB) return null;
    row = { sha256: sha, mime, bytes: bytes.length, storage: 'db', storage_key: sha, bytes_enc: encryptString(bytes.toString('base64'), SCOPE) };
  }
  const { error } = await admin.from('media_evidence_blobs').insert(row);
  if (error && error.code !== '23505') return null;
  return { sha256: sha, storage: String(row.storage) };
}

export async function loadMediaBlob(admin: SupabaseClient, sha: string): Promise<{ bytes: Buffer; mime: string } | null> {
  const { data } = await admin.from('media_evidence_blobs').select('mime, storage, storage_key, bytes_enc').eq('sha256', sha).maybeSingle();
  const r = data as { mime: string; storage: string; storage_key: string; bytes_enc: string | null } | null;
  if (!r) return null;
  let bytes: Buffer | null = null;
  if (r.storage === 'db' && r.bytes_enc) bytes = Buffer.from(decryptString(r.bytes_enc, SCOPE), 'base64');
  else if (r.storage.startsWith('r2:')) {
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');
    const c = await legalR2Client();
    const o = await c.send(new GetObjectCommand({ Bucket: r.storage.slice(3), Key: r.storage_key }));
    const arr = await o.Body?.transformToByteArray();
    bytes = arr ? Buffer.from(arr) : null;
  }
  if (!bytes || sha256Hex(bytes) !== sha) return null;
  return { bytes, mime: r.mime };
}
