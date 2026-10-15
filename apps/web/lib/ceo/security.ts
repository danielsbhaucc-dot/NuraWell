import { createHash, randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { opsCanonicalHostname } from '@/lib/ops-host';
import { b64u, newChallenge, verifyAssertion, verifyRegistration } from './webauthn';

/**
 * Gideon stolen-phone protection.
 * - Routine approvals: one tap in Telegram.
 * - Sensitive (deletes, permission/security, bulk, kill-switch off): passkey (Face ID / fingerprint) step-up
 *   via a one-time link bound to the action, then a trust window (default 4h) with no re-prompt.
 * - Periodic re-verification: every N minutes (default 24h) even routine approvals need one passkey check.
 * - Kill switch + lockout (5 failed step-ups → 30 min) + alerts. Kill switch / new chat invalidate trust.
 */
export const MAX_FAILED = 5;
export const LOCK_MINUTES = 30;
const LINK_TTL_MS = 10 * 60_000;

export type SecState = {
  disabled: boolean;
  disabled_reason: string | null;
  locked_until: string | null;
  failed_stepups: number;
  stepup_trust_minutes: number;
  reverify_minutes: number;
  trusted_until: string | null;
  last_verified_at: string | null;
};

export async function securityState(db: SupabaseClient): Promise<SecState> {
  const { data } = await db
    .from('gideon_settings')
    .select('disabled, disabled_reason, locked_until, failed_stepups, stepup_trust_minutes, reverify_minutes, trusted_until, last_verified_at')
    .eq('id', 1)
    .maybeSingle();
  const d = (data ?? {}) as Partial<SecState>;
  return {
    disabled: Boolean(d.disabled),
    disabled_reason: d.disabled_reason ?? null,
    locked_until: d.locked_until ?? null,
    failed_stepups: Number(d.failed_stepups ?? 0),
    stepup_trust_minutes: Number(d.stepup_trust_minutes ?? 240),
    reverify_minutes: Number(d.reverify_minutes ?? 1440),
    trusted_until: d.trusted_until ?? null,
    last_verified_at: d.last_verified_at ?? null,
  };
}

async function patchState(db: SupabaseClient, patch: Record<string, unknown>) {
  await db.from('gideon_settings').upsert({ id: 1, ...patch }, { onConflict: 'id' });
}

const SENSITIVE_TABLES = new Set(['profiles', 'subscriptions', 'site_settings']);
/** Sensitive = irreversible, permission/security-relevant, or bulk. Everything else stays one-tap. */
export function isSensitive(tool: string, args: Record<string, unknown>, destructive = false): boolean {
  if (destructive || tool === 'db_delete' || tool === 'delete_user') return true;
  if (tool === 'db_update') {
    const match = (args.match ?? {}) as Record<string, unknown>;
    if (!('id' in match) && !('user_id' in match)) return true; // bulk
    if (SENSITIVE_TABLES.has(String(args.table))) return true;
  }
  if (tool === 'db_insert' && SENSITIVE_TABLES.has(String(args.table))) return true;
  return false;
}

export async function hasPasskey(db: SupabaseClient): Promise<boolean> {
  const { data } = await db.from('admin_passkeys').select('id').limit(1);
  return Boolean(data?.length);
}

export type Gate = { ok: true } | { ok: false; reason: 'disabled' | 'locked' | 'stepup' | 'no_passkey'; text: string };

export async function gateApproval(db: SupabaseClient, sensitive: boolean, now = Date.now(), o: { skipStepup?: boolean } = {}): Promise<Gate> {
  const s = await securityState(db);
  if (s.disabled) return { ok: false, reason: 'disabled', text: '⛔ גדעון מושבת כרגע. אפשר להפעיל מחדש מ-Ops.' };
  if (s.locked_until && Date.parse(s.locked_until) > now) {
    return { ok: false, reason: 'locked', text: '🔒 גדעון נעול זמנית אחרי ניסיונות אימות כושלים. אפשר לשחרר מיד מ-Ops.' };
  }
  if (o.skipStepup) return { ok: true };
  const enrolled = await hasPasskey(db);
  if (!enrolled) {
    return sensitive
      ? { ok: false, reason: 'no_passkey', text: '🔐 פעולה רגישה דורשת Face ID, ועוד לא נרשם מפתח. אפשר לרשום ב-Ops ← גדעון ← אבטחה.' }
      : { ok: true };
  }
  const trusted = s.trusted_until && Date.parse(s.trusted_until) > now;
  const overdue = s.reverify_minutes > 0 && (!s.last_verified_at || Date.parse(s.last_verified_at) + s.reverify_minutes * 60_000 < now);
  if ((sensitive && !trusted) || overdue) {
    return { ok: false, reason: 'stepup', text: sensitive ? '🔐 פעולה רגישה. אשר עם Face ID:' : '🔐 הגיע הזמן לאימות תקופתי. אשר עם Face ID:' };
  }
  return { ok: true };
}

export function rpId(): string {
  return (process.env.CEO_STEPUP_RP_ID || opsCanonicalHostname() || 'nurawell.vercel.app').trim().toLowerCase();
}
export const rpOrigins = () => [`https://${rpId()}`, ...(process.env.NODE_ENV === 'development' ? ['http://localhost:3000'] : [])];
const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');

/** One-time link (10 min) bound to a purpose (+ action). Only its hash is stored. */
export type Purpose = 'approve' | 'unlock' | 'register' | 'verify' | 'ops_login' | 'settings' | 'remove_key';
export async function createStepupLink(db: SupabaseClient, purpose: Purpose, opts: { actionId?: string; userId?: string; payload?: Record<string, unknown>; next?: string } = {}) {
  const token = b64u.enc(randomBytes(32));
  const { error } = await db.from('webauthn_challenges').insert({
    purpose,
    action_id: opts.actionId ?? null,
    user_id: opts.userId ?? null,
    token_hash: hashToken(token),
    payload: opts.payload ?? null,
    expires_at: new Date(Date.now() + LINK_TTL_MS).toISOString(),
  });
  if (error) throw new Error(error.message);
  const page = purpose === 'register' ? 'passkey' : 'verify';
  const next = opts.next && /^\/[A-Za-z0-9/_?=&.-]*$/.test(opts.next) && !opts.next.startsWith('//') ? `&next=${encodeURIComponent(opts.next)}` : '';
  return `https://${rpId()}/gideon/${page}?t=${token}${next}`;
}

type ChallengeRow = { id: string; purpose: string; action_id: string | null; user_id: string | null; challenge: string | null; expires_at: string; used_at: string | null; payload: Record<string, unknown> | null };
async function loadLink(db: SupabaseClient, token: string): Promise<ChallengeRow | null> {
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return null;
  const { data } = await db.from('webauthn_challenges').select('id, purpose, action_id, user_id, challenge, expires_at, used_at, payload').eq('token_hash', hashToken(token)).maybeSingle();
  const r = data as ChallengeRow | null;
  if (!r || r.used_at || Date.parse(r.expires_at) <= Date.now()) return null;
  return r;
}

/** Issue a fresh WebAuthn challenge for a valid link. */
export async function linkOptions(db: SupabaseClient, token: string) {
  const r = await loadLink(db, token);
  if (!r) return null;
  const challenge = newChallenge();
  await db.from('webauthn_challenges').update({ challenge }).eq('id', r.id).is('used_at', null);
  let summary: string | null = null;
  if (r.action_id) {
    const { data } = await db.from('ceo_pending_actions').select('summary').eq('id', r.action_id).maybeSingle();
    summary = (data as { summary?: string } | null)?.summary ?? null;
  }
  if (r.purpose === 'register') {
    const { data: p } = await db.from('profiles').select('full_name').eq('id', r.user_id ?? '').maybeSingle();
    return { purpose: r.purpose, challenge, rpId: rpId(), user: { id: b64u.enc(Buffer.from(String(r.user_id))), name: 'admin', displayName: (p as { full_name?: string } | null)?.full_name || 'Admin' } };
  }
  if (r.purpose === 'settings') summary = `שינוי הגדרות אבטחה: חלון אמון ${r.payload?.trust_minutes} דק׳, אימות תקופתי ${r.payload?.reverify_minutes} דק׳`;
  if (r.purpose === 'remove_key') summary = `הסרת מפתח: ${String(r.payload?.label ?? '')}`;
  if (r.purpose === 'ops_login') summary = 'כניסה ללוח הבקרה';
  const { data: keys } = await db.from('admin_passkeys').select('credential_id');
  return { purpose: r.purpose, challenge, rpId: rpId(), summary, allow: (keys ?? []).map((k: { credential_id: string }) => k.credential_id) };
}

/** Atomically consume a link (single use → replay-protected). */
async function consume(db: SupabaseClient, id: string): Promise<boolean> {
  const { data } = await db.from('webauthn_challenges').update({ used_at: new Date().toISOString() }).eq('id', id).is('used_at', null).select('id');
  return Boolean(data?.length);
}

export async function registerPasskey(
  db: SupabaseClient,
  token: string,
  body: { credentialId: string; clientDataJSON: string; authenticatorData: string; publicKey: string; alg: number; label?: string },
) {
  const r = await loadLink(db, token);
  if (!r || r.purpose !== 'register' || !r.challenge || !r.user_id) return { ok: false as const, error: 'הקישור לא תקף או שפג תוקפו.' };
  try {
    const v = verifyRegistration({ ...body, challenge: r.challenge, rpId: rpId(), origins: rpOrigins() });
    if (!(await consume(db, r.id))) return { ok: false as const, error: 'הקישור כבר נוצל.' };
    const { error } = await db.from('admin_passkeys').insert({ user_id: r.user_id, credential_id: body.credentialId, public_key: body.publicKey, alg: body.alg, sign_count: v.signCount, label: (body.label ?? '').slice(0, 60) });
    if (error) throw new Error(error.message);
    await audit(db, 'admin', 'passkey_registered', { label: body.label ?? '' });
    return { ok: true as const };
  } catch (e) {
    console.error('[ceo-stepup] register', e instanceof Error ? e.message : e);
    return { ok: false as const, error: 'הרישום נכשל. נסה שוב.' };
  }
}

async function audit(db: SupabaseClient, actor: string, event: string, detail: Record<string, unknown> = {}, actionId?: string) {
  await db.from('ceo_audit_log').insert({ actor, event, tool: null, action_id: actionId ?? null, detail });
}

/** Failed step-up: count, lock after MAX_FAILED, kill trust, alert. */
export async function recordFailure(db: SupabaseClient, why: string, alert?: (text: string) => Promise<void>) {
  const s = await securityState(db);
  const failed = s.failed_stepups + 1;
  const lock = failed >= MAX_FAILED;
  await patchState(db, { failed_stepups: failed, trusted_until: null, ...(lock ? { locked_until: new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString() } : {}) });
  await audit(db, 'stepup', lock ? 'stepup_locked' : 'stepup_failed', { why, failed });
  if (lock) await alert?.(`🔒 גדעון ננעל ל-${LOCK_MINUTES} דקות אחרי ${failed} ניסיונות אימות כושלים. אם זה לא אתה, הפעל את מתג הכיבוי ב-Ops.`).catch(() => {});
}

export type StepupBody = { credentialId: string; clientDataJSON: string; authenticatorData: string; signature: string };

/** Verify an assertion for a link; on success opens the trust window and returns what to do next. */
export async function verifyStepup(db: SupabaseClient, token: string, body: StepupBody, alert?: (text: string) => Promise<void>) {
  const r = await loadLink(db, token);
  if (!r || r.purpose === 'register' || !r.challenge) return { ok: false as const, error: 'הקישור לא תקף או שפג תוקפו.' };
  const s = await securityState(db);
  if (r.purpose !== 'unlock' && s.locked_until && Date.parse(s.locked_until) > Date.now()) return { ok: false as const, error: 'גדעון נעול זמנית.' };
  const { data: key } = await db.from('admin_passkeys').select('id, user_id, public_key, alg, sign_count').eq('credential_id', body.credentialId).maybeSingle();
  try {
    if (!key) throw new Error('unknown credential');
    if (r.user_id && (key as { user_id: string }).user_id !== r.user_id) throw new Error('credential of another user');
    const k = key as { id: string; public_key: string; alg: number; sign_count: number };
    const v = verifyAssertion({ ...body, publicKey: k.public_key, alg: k.alg, storedSignCount: Number(k.sign_count), challenge: r.challenge, rpId: rpId(), origins: rpOrigins() });
    if (!(await consume(db, r.id))) throw new Error('link already used');
    await db.from('admin_passkeys').update({ sign_count: v.signCount, last_used_at: new Date().toISOString() }).eq('id', k.id);
  } catch (e) {
    await recordFailure(db, e instanceof Error ? e.message : String(e), alert);
    return { ok: false as const, error: 'האימות נכשל.' };
  }
  const now = Date.now();
  await patchState(db, {
    failed_stepups: 0,
    last_verified_at: new Date(now).toISOString(),
    trusted_until: new Date(now + s.stepup_trust_minutes * 60_000).toISOString(),
    ...(r.purpose === 'unlock' ? { locked_until: null, disabled: false, disabled_reason: null } : {}),
    ...(r.purpose === 'settings' && r.payload ? { stepup_trust_minutes: Number(r.payload.trust_minutes), reverify_minutes: Number(r.payload.reverify_minutes) } : {}),
  });
  if (r.purpose === 'remove_key' && r.payload?.keyId) await db.from('admin_passkeys').delete().eq('id', String(r.payload.keyId));
  if (r.purpose === 'settings' || r.purpose === 'remove_key') await audit(db, 'passkey', r.purpose, r.payload ?? {});
  await audit(db, 'passkey', `stepup_ok_${r.purpose}`, {}, r.action_id ?? undefined);
  return { ok: true as const, purpose: r.purpose, actionId: r.action_id, userId: r.user_id };
}

/** Kill switch: instant, no step-up needed to turn OFF Gideon (only to turn back on). */
export async function killSwitch(db: SupabaseClient, actor: string, reason: string) {
  await patchState(db, { disabled: true, disabled_reason: reason.slice(0, 200), trusted_until: null });
  await db.from('ceo_pending_actions').update({ status: 'rejected', decided_at: new Date().toISOString() }).eq('status', 'pending');
  await audit(db, actor, 'kill_switch_on', { reason });
}

export async function invalidateTrust(db: SupabaseClient, why: string) {
  await patchState(db, { trusted_until: null });
  await audit(db, 'system', 'trust_invalidated', { why });
}

/** @deprecated direct write — security settings now change only after a passkey step-up (purpose 'settings'). */
export async function setTrustSettings(db: SupabaseClient, actor: string, trustMinutes: number, reverifyMinutes: number) {
  await patchState(db, { stepup_trust_minutes: trustMinutes, reverify_minutes: reverifyMinutes });
  await audit(db, actor, 'trust_settings', { trustMinutes, reverifyMinutes });
}
