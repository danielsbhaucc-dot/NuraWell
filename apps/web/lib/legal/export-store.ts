import 'server-only';
/**
 * Generated evidence exports (PDF/ZIP) are built on demand. A copy is kept only under exports/ in the
 * private legal bucket with a 7-day lifecycle (auto-delete); raw evidence elsewhere is permanent.
 * Every generation is logged (SHA-256, who, when, which record hashes) so it can be re-verified.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { sha256Hex } from './evidence-crypto';
import { legalBucket, legalR2Client } from './evidence-storage';
import { auditLegalAccess } from './evidence-verify';

export const EXPORT_PREFIX = 'exports/';
export const EXPORT_TTL_DAYS = 7;
let lifecycleOk = false;

/** Idempotent: ensures the 7-day expiry rule on exports/ (keeps any other rules). */
export async function ensureExportLifecycle(): Promise<boolean> {
  const bucket = legalBucket();
  if (!bucket || lifecycleOk) return lifecycleOk;
  try {
    const { GetBucketLifecycleConfigurationCommand, PutBucketLifecycleConfigurationCommand } = await import('@aws-sdk/client-s3');
    const c = await legalR2Client();
    let rules: Array<Record<string, unknown>> = [];
    try { rules = ((await c.send(new GetBucketLifecycleConfigurationCommand({ Bucket: bucket }))).Rules ?? []) as unknown as Array<Record<string, unknown>>; } catch { rules = []; }
    if (!rules.some((r) => r.ID === 'nw-exports-7d')) {
      rules.push({ ID: 'nw-exports-7d', Status: 'Enabled', Filter: { Prefix: EXPORT_PREFIX }, Expiration: { Days: EXPORT_TTL_DAYS } });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await c.send(new PutBucketLifecycleConfigurationCommand({ Bucket: bucket, LifecycleConfiguration: { Rules: rules as any } }));
    }
    lifecycleOk = true;
  } catch (e) {
    console.warn('[legal-export] lifecycle rule not set', { error: e instanceof Error ? e.name : 'error' });
  }
  return lifecycleOk;
}

export async function storeAndLogExport(admin: SupabaseClient, p: { actorId: string; kind: 'consent' | 'media'; subject: string; caseRef: string; format: 'pdf' | 'zip'; bytes: Buffer; recordHashes: string[]; generatedAt: string }) {
  const sha = sha256Hex(p.bytes);
  let key: string | null = null;
  const bucket = legalBucket();
  if (bucket && (await ensureExportLifecycle())) {
    try {
      const { PutObjectCommand } = await import('@aws-sdk/client-s3');
      key = `${EXPORT_PREFIX}${p.generatedAt.slice(0, 10)}/${p.caseRef}.${p.format}`;
      await (await legalR2Client()).send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: p.bytes, ContentType: p.format === 'pdf' ? 'application/pdf' : 'application/zip', Metadata: { sha256: sha } }));
    } catch { key = null; }
  }
  await auditLegalAccess(admin, p.actorId, `legal_${p.kind}_export_generated`, {
    subject: p.subject, case_ref: p.caseRef, format: p.format, export_sha256: sha, bytes: p.bytes.length, generated_at: p.generatedAt,
    record_hashes: p.recordHashes, records_digest: sha256Hex(p.recordHashes.join('\n')), stored_key: key, expires_days: key ? EXPORT_TTL_DAYS : 0,
  });
  return { sha, key };
}
