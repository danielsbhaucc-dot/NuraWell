/**
 * Ops new-device approval (server only).
 *
 * Trusted device = httpOnly cookie `<id>.<secret>.<hmac>` + server row holding sha256(secret).
 * Unknown device after password login → pending request (5 min, one-time) approved by ONE of:
 *   1. Telegram "אשר כניסה" → Gideon Mini App Face ID (purpose ops_login)
 *   2. an already-trusted Ops session (in-Ops alert)
 *   3. a one-time recovery code (bcrypt in DB, single use, DB lockout)
 *   4. email from gideon@ (6-digit code / same-browser link, 10 min, 5 attempts)
 * "זה לא אני" → deny + revoke all sessions + Gideon kill switch alert.
 * Bootstrap: a session created before rollout auto-registers (first device), within 7 days.
 */
import { createHash, createHmac, hkdfSync, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

export const DEVICE_COOKIE = 'nw_ops_dev';
export const PENDING_COOKIE = 'nw_ops_pend';
export const DEVICE_MAX_AGE_S = 180 * 86_400;
export const REQUEST_TTL_MS = 5 * 60_000;
export const BOOTSTRAP_SESSION_DAYS = 7;
export const ONE_TAP_WINDOW_MS = 24 * 3600_000;
export const RECOVERY_MAX_FAILS = 5;
export const RECOVERY_LOCK_MIN = 30;
export const RECOVERY_CODE_COUNT = 10;

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const b64u = (b: Buffer) => b.toString('base64url');

let cachedKey: Buffer | null = null;
function cookieKey(): Buffer {
  if (cachedKey) return cachedKey;
  const own = process.env.OPS_DEVICE_COOKIE_KEY?.trim();
  const base = own || process.env.PII_ENCRYPTION_KEY?.trim();
  if (!base) throw new Error('OPS_DEVICE_COOKIE_KEY / PII_ENCRYPTION_KEY missing');
  // separate purpose key (HKDF) — never reuses the encryption key directly
  cachedKey = Buffer.from(hkdfSync('sha256', Buffer.from(base), Buffer.from('nurawell'), Buffer.from('ops-device-cookie-v1'), 32));
  return cachedKey;
}
/** tests only */
export function __resetDeviceKey() { cachedKey = null; }

function sign(payload: string): string {
  return b64u(createHmac('sha256', cookieKey()).update(payload).digest());
}
function safeEq(a: string, b: string): boolean {
  const x = Buffer.from(a); const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function makeCookieValue(id: string, secret: string): string {
  return `${id}.${secret}.${sign(`${id}.${secret}`)}`;
}
export function parseCookieValue(v: string | null | undefined): { id: string; secret: string } | null {
  if (!v || v.length > 200) return null;
  const [id, secret, mac] = v.split('.');
  if (!id || !secret || !mac || !/^[0-9a-f-]{36}$/.test(id)) return null;
  if (!safeEq(mac, sign(`${id}.${secret}`))) return null;
  return { id, secret };
}
export const cookieOpts = (maxAge: number) => ({ httpOnly: true, secure: true, sameSite: 'lax' as const, path: '/', maxAge });

/* ───────────── device label / location ───────────── */
export function deviceLabel(ua: string | null | undefined): string {
  const u = ua ?? '';
  const browser = /Edg\//.test(u) ? 'Edge' : /CriOS|Chrome\//.test(u) ? 'Chrome' : /FxiOS|Firefox\//.test(u) ? 'Firefox' : /Safari\//.test(u) ? 'Safari' : 'דפדפן';
  const os = /iPhone/.test(u) ? 'iPhone' : /iPad/.test(u) ? 'iPad' : /Android/.test(u) ? 'Android' : /Mac OS X/.test(u) ? 'Mac' : /Windows/.test(u) ? 'Windows' : /Linux/.test(u) ? 'Linux' : 'מכשיר';
  return `${browser} · ${os}`;
}
export function approxLocation(h: Headers): string {
  const city = decodeURIComponent(h.get('x-vercel-ip-city') ?? '').trim();
  const country = (h.get('x-vercel-ip-country') ?? '').trim();
  return [city, country].filter(Boolean).join(', ') || 'מיקום לא ידוע';
}

/* ───────────── trusted devices ───────────── */
export async function isTrustedDevice(db: SupabaseClient, userId: string, cookie: string | null | undefined): Promise<boolean> {
  const p = parseCookieValue(cookie);
  if (!p) return false;
  return (await trustedDeviceId(db, userId, cookie)) !== null;
}

/** Trusted device id for this cookie (handoff children also need a live parent). */
export async function trustedDeviceId(db: SupabaseClient, userId: string, cookie: string | null | undefined): Promise<string | null> {
  const p = parseCookieValue(cookie);
  if (!p) return null;
  const { data } = await db.from('ops_trusted_devices').select('id, user_id, secret_hash, revoked_at, last_seen_at, parent_id').eq('id', p.id).maybeSingle();
  const d = data as { id: string; user_id: string; secret_hash: string; revoked_at: string | null; last_seen_at: string; parent_id: string | null } | null;
  if (!d || d.revoked_at || d.user_id !== userId || !safeEq(d.secret_hash, sha(p.secret))) return null;
  if (d.parent_id) {
    const { data: par } = await db.from('ops_trusted_devices').select('revoked_at').eq('id', d.parent_id).maybeSingle();
    if (!par || (par as { revoked_at: string | null }).revoked_at) return null;
  }
  if (Date.now() - Date.parse(d.last_seen_at) > 3600_000) {
    await db.from('ops_trusted_devices').update({ last_seen_at: new Date().toISOString() }).eq('id', d.id);
  }
  return d.id;
}

export async function createTrustedDevice(db: SupabaseClient, userId: string, label: string, via: string, parentId?: string): Promise<string> {
  const secret = b64u(randomBytes(32));
  if (parentId) await db.from('ops_trusted_devices').update({ revoked_at: new Date().toISOString() }).eq('parent_id', parentId).is('revoked_at', null);
  const { data, error } = await db.from('ops_trusted_devices').insert({ user_id: userId, secret_hash: sha(secret), label: label.slice(0, 80), via, parent_id: parentId ?? null }).select('id').single();
  if (error || !data) throw new Error(`trusted device: ${error?.message}`);
  await audit(db, userId, 'ops_device_trusted', { via, label });
  return makeCookieValue((data as { id: string }).id, secret);
}

/** Bootstrap: session created before rollout (and within 7 days of it) → first trusted device. */
export async function canBootstrap(db: SupabaseClient, userId: string, sessionId: string | null, now = Date.now()): Promise<boolean> {
  if (!sessionId) return false;
  const { data: pol } = await db.from('ops_device_policy').select('enforce_from').maybeSingle();
  const from = Date.parse((pol as { enforce_from?: string } | null)?.enforce_from ?? '');
  if (!Number.isFinite(from) || now - from > BOOTSTRAP_SESSION_DAYS * 86_400_000) return false;
  const { data } = await db.rpc('ops_session_created_at', { p_session: sessionId, p_user: userId });
  const created = Date.parse(String(data ?? ''));
  return Number.isFinite(created) && created < from;
}

/* ───────────── pending login requests ───────────── */
export type LoginRequest = { id: string; user_id: string; status: string; label: string; location: string; created_at: string; expires_at: string; recovery_failures: number; pending_hash: string };

export async function startLoginRequest(db: SupabaseClient, userId: string, label: string, location: string): Promise<{ id: string; pendingCookie: string; expiresAt: string }> {
  const secret = b64u(randomBytes(32));
  const expiresAt = new Date(Date.now() + REQUEST_TTL_MS).toISOString();
  // only one open request per user — older ones expire
  await db.from('ops_login_requests').update({ status: 'expired' }).eq('user_id', userId).eq('status', 'pending');
  const { data, error } = await db.from('ops_login_requests').insert({ user_id: userId, pending_hash: sha(secret), status: 'pending', label: label.slice(0, 80), location: location.slice(0, 80), expires_at: expiresAt, recovery_failures: 0, email_attempts: 0 }).select('id').single();
  if (error || !data) throw new Error(`login request: ${error?.message}`);
  const id = (data as { id: string }).id;
  await audit(db, userId, 'ops_login_pending', { id, label, location });
  return { id, pendingCookie: makeCookieValue(id, secret), expiresAt };
}

export async function loadRequest(db: SupabaseClient, id: string): Promise<LoginRequest | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const { data } = await db.from('ops_login_requests').select('id, user_id, status, label, location, created_at, expires_at, recovery_failures, pending_hash').eq('id', id).maybeSingle();
  return (data as LoginRequest | null) ?? null;
}
const isOpen = (r: LoginRequest | null, now = Date.now()) => Boolean(r && r.status === 'pending' && Date.parse(r.expires_at) > now);

/** Requesting browser: its pending cookie proves it owns the request. */
export async function requestForPendingCookie(db: SupabaseClient, userId: string, cookie: string | null | undefined): Promise<LoginRequest | null> {
  const p = parseCookieValue(cookie);
  if (!p) return null;
  const r = await loadRequest(db, p.id);
  if (!r || r.user_id !== userId || !safeEq(r.pending_hash, sha(p.secret))) return null;
  return r;
}

/** Approve once (atomic pending→approved, not expired). */
export async function decideRequest(db: SupabaseClient, id: string, approve: boolean, via: string): Promise<LoginRequest | null> {
  const r = await loadRequest(db, id);
  if (!isOpen(r)) return null;
  const { data } = await db.from('ops_login_requests')
    .update({ status: approve ? 'approved' : 'denied', decided_at: new Date().toISOString(), decided_via: via })
    .eq('id', id).eq('status', 'pending').gt('expires_at', new Date().toISOString()).select('id');
  if (!data?.length) return null;
  await audit(db, r!.user_id, approve ? 'ops_login_approved' : 'ops_login_denied', { id, via, label: r!.label, location: r!.location });
  if (!approve) {
    const { data: n } = await db.rpc('ops_revoke_user_sessions', { p_user: r!.user_id });
    await audit(db, r!.user_id, 'ops_sessions_revoked', { id, sessions: Number(n ?? 0) });
  }
  return { ...r!, status: approve ? 'approved' : 'denied' };
}

/** Requesting browser after approval: one-time consume → trusted device cookie. */
export async function consumeApproved(db: SupabaseClient, r: LoginRequest): Promise<string | null> {
  if (r.status !== 'approved') return null;
  const { data } = await db.from('ops_login_requests').update({ status: 'consumed' }).eq('id', r.id).eq('status', 'approved').select('id');
  if (!data?.length) return null;
  return createTrustedDevice(db, r.user_id, r.label, 'approval');
}

/* ───────────── recovery codes ───────────── */
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function normalizeCode(c: string): string {
  return c.toUpperCase().replace(/[^A-Z0-9]/g, '');
}
export function newCode(): string {
  let s = '';
  for (let i = 0; i < 10; i++) s += ALPHA[randomInt(ALPHA.length)];
  return `${s.slice(0, 5)}-${s.slice(5)}`;
}

/** Replace all codes; returns plaintext ONCE (never stored). */
export async function regenerateRecoveryCodes(db: SupabaseClient, userId: string, actor: string): Promise<string[]> {
  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, newCode);
  // bcrypt in the DB (pgcrypto) — same scheme the break-glass SQL uses
  const { error } = await db.rpc('ops_set_recovery_codes', { p_user: userId, p_codes: codes });
  if (error) throw new Error(`recovery codes: ${error.message}`);
  await db.from('ops_security_state').upsert({ user_id: userId, codes_pending_display: false, updated_at: new Date().toISOString() });
  await audit(db, userId, 'ops_recovery_codes_generated', { actor, count: codes.length });
  return codes;
}

export async function unusedCodeCount(db: SupabaseClient, userId: string): Promise<number> {
  const { count } = await db.from('ops_recovery_codes').select('id', { count: 'exact', head: true }).eq('user_id', userId).is('used_at', null);
  return count ?? 0;
}

export type RecoveryResult = { ok: true; cookie: string } | { ok: false; error: string; locked?: boolean };

/** Use one code for the requesting browser's pending request. DB lockout (rate limiter may be per-instance). */
export async function redeemRecoveryCode(db: SupabaseClient, r: LoginRequest, code: string): Promise<RecoveryResult> {
  const uid = r.user_id;
  const { data: st } = await db.from('ops_security_state').select('recovery_failures, recovery_locked_until').eq('user_id', uid).maybeSingle();
  const s = st as { recovery_failures: number; recovery_locked_until: string | null } | null;
  if (s?.recovery_locked_until && Date.parse(s.recovery_locked_until) > Date.now()) return { ok: false, error: 'נחסם זמנית אחרי ניסיונות כושלים. נסה שוב מאוחר יותר.', locked: true };
  if (!isOpen(r)) return { ok: false, error: 'הבקשה פגה. התחבר מחדש.' };
  const { data: hitOk } = normalizeCode(code).length === 10 ? await db.rpc('ops_use_recovery_code', { p_user: uid, p_code: code }) : { data: false };
  const hit = hitOk === true;
  if (!hit) {
    const fails = (s?.recovery_failures ?? 0) + 1;
    const lock = fails >= RECOVERY_MAX_FAILS;
    await db.from('ops_security_state').upsert({ user_id: uid, recovery_failures: lock ? 0 : fails, recovery_locked_until: lock ? new Date(Date.now() + RECOVERY_LOCK_MIN * 60_000).toISOString() : null, updated_at: new Date().toISOString() });
    await audit(db, uid, lock ? 'ops_recovery_locked' : 'ops_recovery_failed', { request: r.id, fails });
    return { ok: false, error: lock ? 'נחסם ל-30 דקות אחרי 5 ניסיונות כושלים.' : 'הקוד לא תקין.', locked: lock };
  }
  await db.from('ops_security_state').upsert({ user_id: uid, recovery_failures: 0, recovery_locked_until: null, updated_at: new Date().toISOString() });
  const d = await decideRequest(db, r.id, true, 'recovery_code');
  if (!d) return { ok: false, error: 'הבקשה פגה. התחבר מחדש.' };
  const cookie = await consumeApproved(db, d);
  if (!cookie) return { ok: false, error: 'לא הצלחתי לסיים את האישור.' };
  await audit(db, uid, 'ops_recovery_code_used', { request: r.id });
  return { ok: true, cookie };
}

/* ───────────── devices list / revoke ───────────── */
export async function listDevices(db: SupabaseClient, userId: string) {
  const { data } = await db.from('ops_trusted_devices').select('id, label, via, created_at, last_seen_at').eq('user_id', userId).is('revoked_at', null).is('parent_id', null).order('last_seen_at', { ascending: false });
  return (data ?? []) as { id: string; label: string; via: string; created_at: string; last_seen_at: string }[];
}
export async function revokeDevice(db: SupabaseClient, userId: string, id: string, actor: string): Promise<boolean> {
  const { data } = await db.from('ops_trusted_devices').update({ revoked_at: new Date().toISOString() }).eq('id', id).eq('user_id', userId).is('revoked_at', null).select('id');
  await db.from('ops_trusted_devices').update({ revoked_at: new Date().toISOString() }).eq('parent_id', id).is('revoked_at', null);
  if (data?.length) await audit(db, userId, 'ops_device_revoked', { id, actor });
  return Boolean(data?.length);
}
export async function openRequestsFor(db: SupabaseClient, userId: string) {
  const { data } = await db.from('ops_login_requests').select('id, label, location, created_at, expires_at').eq('user_id', userId).eq('status', 'pending').gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false }).limit(3);
  return (data ?? []) as { id: string; label: string; location: string; created_at: string; expires_at: string }[];
}

export async function audit(db: SupabaseClient, userId: string, event: string, detail: Record<string, unknown> = {}) {
  await db.from('admin_audit_log').insert({ actor_id: userId, method: 'SECURITY', path: event, detail }).then(() => undefined, () => undefined);
}

/* ───────────── email approval (6-digit code + one-time link) ───────────── */
export const EMAIL_TTL_MS = 10 * 60_000;
export const EMAIL_MAX_ATTEMPTS = 5;
const codeMac = (id: string, code: string) => sign(`email-code:${id}:${code}`);

/** Email path stays redeemable up to 10 min (the other paths: 5 min). */
function emailOpen(r: (LoginRequest & { email_expires_at?: string | null }) | null, now = Date.now()) {
  return Boolean(r && r.status === 'pending' && r.email_expires_at && Date.parse(r.email_expires_at) > now);
}

export async function createEmailChallenge(db: SupabaseClient, requestId: string): Promise<{ code: string; token: string }> {
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const token = b64u(randomBytes(32));
  const exp = new Date(Date.now() + EMAIL_TTL_MS).toISOString();
  const { error } = await db.from('ops_login_requests').update({ email_code_hash: codeMac(requestId, code), email_token_hash: sha(token), email_expires_at: exp, email_attempts: 0 }).eq('id', requestId).eq('status', 'pending');
  if (error) throw new Error(`email challenge: ${error.message}`);
  return { code, token: `${requestId}.${token}` };
}

type EmailRow = LoginRequest & { email_code_hash: string | null; email_token_hash: string | null; email_expires_at: string | null; email_attempts: number };
async function loadEmailRow(db: SupabaseClient, id: string): Promise<EmailRow | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const { data } = await db.from('ops_login_requests').select('id, user_id, status, label, location, created_at, expires_at, recovery_failures, pending_hash, email_code_hash, email_token_hash, email_expires_at, email_attempts').eq('id', id).maybeSingle();
  return (data as EmailRow | null) ?? null;
}

async function approveViaEmail(db: SupabaseClient, r: EmailRow, via: string): Promise<RecoveryResult> {
  const { data } = await db.from('ops_login_requests').update({ status: 'approved', decided_at: new Date().toISOString(), decided_via: via, email_code_hash: null, email_token_hash: null })
    .eq('id', r.id).eq('status', 'pending').select('id');
  if (!data?.length) return { ok: false, error: 'הבקשה כבר טופלה.' };
  await audit(db, r.user_id, 'ops_login_approved', { id: r.id, via, label: r.label, location: r.location });
  const cookie = await consumeApproved(db, { ...r, status: 'approved' });
  return cookie ? { ok: true, cookie } : { ok: false, error: 'לא הצלחתי לסיים את האישור.' };
}

/** Code typed in the pending browser (r already proven by its pending cookie). 5 attempts → request dies. */
export async function redeemEmailCode(db: SupabaseClient, requestId: string, code: string): Promise<RecoveryResult> {
  const r = await loadEmailRow(db, requestId);
  if (!r || !emailOpen(r) || !r.email_code_hash) return { ok: false, error: 'הקוד פג. התחבר מחדש.' };
  if (r.email_attempts >= EMAIL_MAX_ATTEMPTS) return { ok: false, error: 'יותר מדי ניסיונות. התחבר מחדש.', locked: true };
  const clean = code.replace(/\D/g, '');
  if (clean.length !== 6 || !safeEq(codeMac(r.id, clean), r.email_code_hash)) {
    const n = r.email_attempts + 1;
    await db.from('ops_login_requests').update({ email_attempts: n, ...(n >= EMAIL_MAX_ATTEMPTS ? { status: 'expired', email_code_hash: null, email_token_hash: null } : {}) }).eq('id', r.id);
    await audit(db, r.user_id, n >= EMAIL_MAX_ATTEMPTS ? 'ops_email_code_locked' : 'ops_email_code_failed', { id: r.id, attempts: n });
    return { ok: false, error: n >= EMAIL_MAX_ATTEMPTS ? 'יותר מדי ניסיונות. התחבר מחדש.' : 'הקוד לא תקין.', locked: n >= EMAIL_MAX_ATTEMPTS };
  }
  return approveViaEmail(db, r, 'email_code');
}

/** Link click: token must match AND the browser must hold this request's pending cookie. */
export async function redeemEmailLink(db: SupabaseClient, userId: string, token: string, pendingCookie: string | null | undefined): Promise<RecoveryResult> {
  const [id, secret] = token.split('.');
  if (!id || !secret || secret.length > 64) return { ok: false, error: 'הקישור לא תקין.' };
  const owner = await requestForPendingCookie(db, userId, pendingCookie);
  if (!owner || owner.id !== id) return { ok: false, error: 'פתח את הקישור באותו דפדפן שבו התחברת, או הקלד שם את הקוד מהמייל.' };
  const r = await loadEmailRow(db, id);
  if (!r || !emailOpen(r) || !r.email_token_hash || !safeEq(r.email_token_hash, sha(secret))) return { ok: false, error: 'הקישור פג או כבר נוצל.' };
  return approveViaEmail(db, r, 'email_link');
}
