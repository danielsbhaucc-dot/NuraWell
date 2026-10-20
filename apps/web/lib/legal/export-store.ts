import 'server-only';
/**
 * Generated evidence exports (PDF/ZIP) are built on demand. A copy is kept only under exports/ in the
 * private legal bucket with a 7-day lifecycle (auto-delete); raw evidence elsewhere is permanent.
 * Every generation is logged (SHA-256, who, when, which record hashes) so it can be re-verified.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
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

export type ExportKind = 'consent' | 'media' | 'platform_logs';

/** ASCII-safe + UTF-8 Content-Disposition (Hebrew names via filename*). */
export function contentDisposition(name: string): string {
  const ascii = name.normalize('NFKD').replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/** "<name or pseudonymous id> · <date> · <code>" — obvious which document belongs to whom. */
export function exportLabel(displayName: string | null | undefined, subject: string, generatedAt: string, code: string) {
  const who = (displayName ?? '').trim() || `משתמש ${subject.slice(0, 8)}`;
  const date = generatedAt.slice(0, 10);
  const safe = who.replace(/[\\/:*?"<>|\n\r\t]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
  return { label: `${who} · ${date} · ${code}`, fileBase: `${safe} ${date} ${code}`.replace(/ /g, '_') };
}

/**
 * Encrypts the export with a fresh memorable passphrase (AES-256), keeps an encrypted copy of the
 * passphrase for 7 days (same lifetime as the exports/ copy), stores the encrypted file under exports/,
 * and logs the generation permanently (hashes of the ORIGINAL plaintext and of the encrypted file).
 */
export async function storeAndLogExport(
  admin: SupabaseClient,
  p: { actorId: string; kind: ExportKind; subject: string; caseRef: string; format: 'pdf' | 'zip'; bytes: Buffer; files?: Record<string, Uint8Array>; recordHashes: string[]; generatedAt: string; displayName?: string | null },
) {
  const { generateExportPassword, passwordVerifier, encryptPdf, encryptZip } = await import('./export-crypto');
  const { encryptString } = await import('@/lib/crypto/pii');
  const { verifyCode } = await import('./verify-code');
  const plainSha = sha256Hex(p.bytes);
  const password = generateExportPassword();
  const out = p.format === 'pdf' ? await encryptPdf(new Uint8Array(p.bytes), password) : await encryptZip(p.files ?? { [`${p.caseRef}.zip`]: new Uint8Array(p.bytes) }, password);
  const sha = sha256Hex(out);
  const code = verifyCode(plainSha);
  const { label, fileBase } = exportLabel(p.displayName, p.subject, p.generatedAt, code);
  const fileName = `${fileBase}.${p.format}`;
  let key: string | null = null;
  const bucket = legalBucket();
  if (bucket && (await ensureExportLifecycle())) {
    try {
      const { PutObjectCommand } = await import('@aws-sdk/client-s3');
      key = `${EXPORT_PREFIX}${p.generatedAt.slice(0, 10)}/${p.caseRef}.${p.format}`;
      await (await legalR2Client()).send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: out, ContentType: p.format === 'pdf' ? 'application/pdf' : 'application/zip', Metadata: { sha256: sha } }));
    } catch { key = null; }
  }
  const id = randomUUID();
  const { error } = await admin.from('legal_export_secrets').insert({
    id, kind: p.kind, subject: p.subject, label, case_ref: p.caseRef, file_name: fileName, format: p.format, export_sha256: sha, stored_key: key,
    pw_enc: encryptString(password, `legal-export:${id}`), pw_verifier: passwordVerifier(password), created_by: p.actorId,
    expires_at: new Date(Date.parse(p.generatedAt) + EXPORT_TTL_DAYS * 86400_000).toISOString(),
  });
  await auditLegalAccess(admin, p.actorId, `legal_${p.kind}_export_generated`, {
    subject: p.subject, case_ref: p.caseRef, format: p.format, export_sha256: sha, plaintext_sha256: plainSha, verify_code: code, encrypted: 'aes-256',
    password_saved: !error, secret_id: error ? null : id, bytes: out.length, generated_at: p.generatedAt,
    record_hashes: p.recordHashes, records_digest: sha256Hex(p.recordHashes.join('\n')), stored_key: key, expires_days: EXPORT_TTL_DAYS,
  });
  return { sha, key, bytes: out, fileName, secretId: error ? null : id, label, code };
}

/** Deletes expired passphrases (the exports/ objects expire by bucket lifecycle on the same day). */
export async function purgeExpiredExportSecrets(admin: SupabaseClient): Promise<number> {
  const { data } = await admin.from('legal_export_secrets').delete().lt('expires_at', new Date().toISOString()).select('id');
  return (data ?? []).length;
}
