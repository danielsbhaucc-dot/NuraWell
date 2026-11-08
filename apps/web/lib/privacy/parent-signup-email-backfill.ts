/**
 * Local-only legacy backfill: parent_signup_claims.email plaintext → enc:v2 + email_bidx.
 * Idempotent. Skips active open claims (updated within 2 minutes) to avoid racing the claim lease.
 * Does not change nonce/parent_sub/state/attempt_id/user_id/session_id. Never logs email/keys.
 */
import { decryptValue } from '@/lib/security/field-crypto';
import { SYSTEM_ROW } from '@/lib/security/field-registry';
import { sealSignupEmailBinding, SIGNUP_EMAIL_MAX_PLAIN } from '@/lib/central/signup-claim-email';

export const SIGNUP_EMAIL_BACKFILL_BATCH = 25;
/** Matches parent_signup_begin reclaim window — active open leases are left alone. */
export const ACTIVE_CLAIM_MINUTES = 2;

export type SignupEmailLegacyRow = {
  nonce: string;
  parent_sub: string;
  email: string;
  email_bidx: string | null;
  state: string;
  updated_at: string;
};

export type SignupEmailPlan =
  | { action: 'skip'; reason: 'already_sealed' | 'has_bidx' | 'active_open' | 'empty' }
  | { action: 'write'; sealed: string; bidx: string; previous: string }
  | { action: 'fail'; reason: string };

export type SignupEmailBatchResult = {
  examined: number;
  skipped: number;
  planned: number;
  written: number;
  failed: number;
  aborted: boolean;
  skipReasons: Record<string, number>;
};

export function isActiveOpenClaim(row: Pick<SignupEmailLegacyRow, 'state' | 'updated_at'>, now = Date.now()): boolean {
  if (row.state !== 'open') return false;
  const t = Date.parse(row.updated_at);
  if (!Number.isFinite(t)) return true; // fail closed: treat unknown as active
  return now - t < ACTIVE_CLAIM_MINUTES * 60_000;
}

export async function planSignupEmailLegacy(row: SignupEmailLegacyRow): Promise<SignupEmailPlan> {
  if (!row.nonce || !row.parent_sub) return { action: 'fail', reason: 'missing_keys' };
  if (row.email_bidx) return { action: 'skip', reason: 'has_bidx' };
  if (typeof row.email !== 'string' || row.email.length === 0) return { action: 'skip', reason: 'empty' };
  if (row.email.startsWith('enc:v2:')) return { action: 'skip', reason: 'already_sealed' };
  if (row.email.startsWith('enc:')) return { action: 'fail', reason: 'unsupported_enc' };
  if (isActiveOpenClaim(row)) return { action: 'skip', reason: 'active_open' };
  if ([...row.email].length > SIGNUP_EMAIL_MAX_PLAIN) return { action: 'fail', reason: 'too_long' };

  let sealed: string;
  let bidx: string;
  try {
    ({ sealed, bidx } = await sealSignupEmailBinding(row.email));
  } catch {
    return { action: 'fail', reason: 'seal_or_key' };
  }
  let back: unknown;
  try {
    back = await decryptValue('parent_signup_claims', 'email', 'system:audit', SYSTEM_ROW, sealed);
  } catch {
    return { action: 'fail', reason: 'decrypt_failed' };
  }
  // Canonical form is NFKC+trim+lower — decrypt must match what seal stored.
  const { normalizeSignupEmail } = await import('@/lib/central/signup-claim-email');
  if (back !== normalizeSignupEmail(row.email)) return { action: 'fail', reason: 'roundtrip_mismatch' };
  return { action: 'write', sealed, bidx, previous: row.email };
}

export type SignupEmailWrite = { nonce: string; sealed: string; bidx: string; previous: string };

/**
 * apply=false → dry-run counts only.
 * write(patch) must CONDITIONAL-UPDATE:
 *   SET email=sealed, email_bidx=bidx
 *   WHERE nonce=$n AND email_bidx IS NULL AND email = previous
 * so an in-flight claim cannot be overwritten mid-lease after we skipped active_open.
 */
export async function runSignupEmailBackfillBatch(
  rows: readonly SignupEmailLegacyRow[],
  write: (patch: SignupEmailWrite) => Promise<boolean>,
  apply: boolean,
): Promise<SignupEmailBatchResult> {
  const slice = rows.slice(0, SIGNUP_EMAIL_BACKFILL_BATCH);
  const result: SignupEmailBatchResult = {
    examined: slice.length, skipped: 0, planned: 0, written: 0, failed: 0,
    aborted: rows.length > SIGNUP_EMAIL_BACKFILL_BATCH,
    skipReasons: {},
  };
  const writes: SignupEmailWrite[] = [];
  for (const row of slice) {
    const plan = await planSignupEmailLegacy(row);
    if (plan.action === 'fail') {
      result.failed += 1;
      result.aborted = true;
      return result;
    }
    if (plan.action === 'skip') {
      result.skipped += 1;
      result.skipReasons[plan.reason] = (result.skipReasons[plan.reason] ?? 0) + 1;
      continue;
    }
    result.planned += 1;
    writes.push({ nonce: row.nonce, sealed: plan.sealed, bidx: plan.bidx, previous: plan.previous });
  }
  if (!apply) return result;
  for (const patch of writes) {
    const ok = await write(patch);
    if (!ok) {
      result.failed += 1;
      result.aborted = true;
      return result;
    }
    result.written += 1;
  }
  return result;
}
