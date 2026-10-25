import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ageEncrypt, logicalDump, sha256 } from '@/lib/platform/backup/logical';
import { legalBucket, legalR2Client } from '@/lib/legal/evidence-storage';

/** Public age recipient (same offline key as scripts/backup/db-backup.age.pub; a test keeps them equal). */
export const BACKUP_AGE_RECIPIENT = 'age1sv2y5amaxz6psz69vnyjqrlttu9w2quh2sjjrh8wxsyxmptyq50snkyl8q';
const PREFIX = 'backups/db/';
const RETENTION_DAYS = 30;
export const LOGICAL_NAME = /^nurawell-logical-(\d{8}T\d{6}Z)\.jsonl\.gz\.age$/;

export async function runNightlyDbBackup(db: SupabaseClient, opts: { verify: boolean }) {
  const bucket = legalBucket();
  if (!bucket) throw new Error('no_bucket');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const name = `nurawell-logical-${stamp}.jsonl.gz.age`;
  const dump = await logicalDump(db, { verify: opts.verify });
  if (dump.rows < 1 || dump.plain.length < 1024) throw new Error('backup_too_small');
  const ct = await ageEncrypt(dump.plain, [BACKUP_AGE_RECIPIENT]);
  const hash = sha256(ct);
  const { PutObjectCommand, GetObjectCommand, ListObjectsV2Command, DeleteObjectCommand } = await import('@aws-sdk/client-s3');
  const c = await legalR2Client();
  await c.send(new PutObjectCommand({ Bucket: bucket, Key: PREFIX + name, Body: ct, ContentType: 'application/octet-stream', Metadata: { sha256: hash } }));
  await c.send(new PutObjectCommand({ Bucket: bucket, Key: `${PREFIX}${name}.sha256`, Body: `${hash}  ${name}\n`, ContentType: 'text/plain' }));
  // Read back and compare (upload integrity).
  const back = await c.send(new GetObjectCommand({ Bucket: bucket, Key: PREFIX + name }));
  const bytes = await back.Body!.transformToByteArray();
  if (sha256(bytes) !== hash) throw new Error('upload_hash_mismatch');
  // Retention (logical copies only; pg_dump copies are pruned by their own route).
  const cutoff = Date.now() - RETENTION_DAYS * 86_400_000;
  let token: string | undefined; let pruned = 0;
  do {
    const l = await c.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: PREFIX + 'nurawell-logical-', ContinuationToken: token }));
    for (const o of l.Contents ?? []) {
      const m = /nurawell-logical-(\d{4})(\d{2})(\d{2})T/.exec(o.Key ?? '');
      if (m && Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!) < cutoff && o.Key) { await c.send(new DeleteObjectCommand({ Bucket: bucket, Key: o.Key })); pruned++; }
    }
    token = l.IsTruncated ? l.NextContinuationToken : undefined;
  } while (token);
  const unverified = opts.verify ? dump.tables.filter((t) => t.verified !== t.rows).map((t) => `${t.schema}.${t.table}`) : [];
  return { name, bytes: ct.length, sha256_prefix: hash.slice(0, 16), tables: dump.tables.length, rows: dump.rows, restore_check: opts.verify ? (unverified.length ? 'failed' : 'ok') : 'skipped', unverified, pruned };
}
