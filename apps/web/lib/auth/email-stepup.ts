import 'server-only';
import { createHash, randomBytes, randomInt } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { consumeGrant, GRANT_TTL_MS, issueGrant } from '@/lib/auth/stepup';

/**
 * One-time email code for the friendly step-up. Stored as a pending row in stepup_grants under
 * purpose "email:<purpose>", hashed together with a random httpOnly nonce (so the code alone is useless
 * on another browser). 5-minute TTL, single use, a new send voids the previous code. Audited via issueGrant.
 */
export const EMAIL_NONCE_COOKIE = 'nw_su_em';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const pendingPurpose = (p: string) => `email:${p}`.slice(0, 64);

export async function createEmailCode(db: SupabaseClient, userId: string, purpose: string) {
  const pp = pendingPurpose(purpose);
  await db.from('stepup_grants').update({ used_at: new Date().toISOString() }).eq('user_id', userId).eq('purpose', pp).is('used_at', null);
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const nonce = randomBytes(24).toString('base64url');
  const { error } = await db.from('stepup_grants').insert({ user_id: userId, purpose: pp, binding_hash: sha(`${nonce}:${code}`), method: 'email_code_pending', expires_at: new Date(Date.now() + GRANT_TTL_MS).toISOString() });
  if (error) throw new Error('email_code');
  await db.from('admin_audit_log').insert({ actor_id: userId, method: 'SECURITY', path: 'stepup_email_sent', detail: { purpose } }).then(() => undefined, () => undefined);
  return { code, nonce };
}

/** Verify + consume the email code; on success issue the real single-use grant for `purpose`. */
export async function verifyEmailCode(db: SupabaseClient, userId: string, purpose: string, nonce: string | null, code: string): Promise<string | null> {
  if (!nonce || !/^\d{6}$/.test(code)) return null;
  const r = await consumeGrant(db, userId, pendingPurpose(purpose), `${nonce}:${code}`);
  if (!r.ok) {
    await db.from('admin_audit_log').insert({ actor_id: userId, method: 'SECURITY', path: 'stepup_email_failed', detail: { purpose } }).then(() => undefined, () => undefined);
    return null;
  }
  return issueGrant(db, userId, purpose, 'email_code');
}
