import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { decryptString, encryptString } from '@/lib/crypto/pii';
import { newTotpSecret, otpauthUri, verifyTotp } from './totp';

/**
 * Step-up verification for sensitive Ops actions (reveal export password, key backup, ...).
 *
 * Public interface for other features (stable):
 *   - UI:     <StepUpDialog purpose="legal.key_backup" onVerified={...} />  (components/admin/StepUpDialog.tsx)
 *   - Server: const g = await requireStepUp(request, admin, userId, 'legal.key_backup'); if (!g.ok) return g.response;
 *
 * Methods (all server-verified, all single use):
 *   1. phone_passkey: desktop shows QR → phone (already-approved Ops device) opens /ops/approve/<id>,
 *      Face ID passkey assertion there → request approved → desktop exchanges for a grant.
 *   2. passkey on this device, 3. TOTP (authenticator app), 4. one-time backup code.
 * Every route that uses this is behind requireApiAdmin, so the Ops device gate stays enforced on BOTH sides.
 * A grant is an httpOnly cookie (sha256 stored), bound to user + purpose, 5 minutes, single use.
 */
export const STEPUP_COOKIE = 'nw_su';
export const STEPUP_REQ_COOKIE = 'nw_su_req';
export const GRANT_TTL_MS = 5 * 60_000;
export const REQUEST_TTL_MS = 2 * 60_000;
export const TOTP_MAX_FAILS = 5;
export const TOTP_LOCK_MIN = 15;

export type StepUpMethod = 'phone_passkey' | 'passkey' | 'totp' | 'backup_code';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const tok = () => randomBytes(32).toString('base64url');
export const validPurpose = (p: unknown): p is string => typeof p === 'string' && /^[a-z0-9_.:-]{2,64}$/.test(p);
export const cookieOpts = (maxAgeS: number) => ({ httpOnly: true, secure: true, sameSite: 'strict' as const, path: '/', maxAge: maxAgeS });

export function readCookieFrom(request: Request, name: string): string | null {
  for (const part of (request.headers.get('cookie') ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

async function log(db: SupabaseClient, userId: string, event: string, detail: Record<string, unknown>) {
  await db.from('admin_audit_log').insert({ actor_id: userId, method: 'SECURITY', path: event, detail }).then(() => undefined, () => undefined);
}

/* ── cross-device request (QR → phone) ──
 * Anti-phishing: the phone shows the action, requesting device/browser, approximate city and time, and asks
 * the user to pick the 2-digit number shown on the requesting screen (number match, 3 choices, 3 misses → reported).
 * "זה לא אני" cancels and records a security event. Bound to the requesting browser (httpOnly binding cookie)
 * and, when signed in, to the requesting auth session. Single use, TTL 2 minutes. */
export type RequestKind = 'ops' | 'user' | 'login';
export const MATCH_MAX_MISSES = 3;
export const sessionHash = (sessionId: string | null | undefined) => (sessionId ? sha(`sess:${sessionId}`) : null);
export const ipHash = (ip: string) => sha(`ip:${ip}`);
const matchCode = () => String(10 + (randomBytes(1)[0] % 90));
export function matchChoices(code: string): string[] {
  const set = new Set([code]);
  while (set.size < 3) set.add(matchCode());
  return [...set].sort(() => (randomBytes(1)[0] & 1 ? 1 : -1));
}
async function securityEvent(db: SupabaseClient, kind: string, detail: Record<string, unknown>) {
  await db.from('ops_security_events').insert({ kind, detail }).then(() => undefined, () => undefined);
}

export async function createRequest(db: SupabaseClient, p: { kind?: RequestKind; userId: string | null; purpose: string; deviceId: string | null; label: string; city?: string | null; ipHash?: string | null; sessionHash?: string | null }) {
  const binding = tok(); const approve = tok(); const code = matchCode();
  const { data, error } = await db.from('stepup_requests').insert({
    kind: p.kind ?? 'ops', user_id: p.userId, purpose: p.purpose, requester_binding_hash: sha(binding), approve_token_hash: sha(approve),
    requester_device_id: p.deviceId, requester_label: p.label.slice(0, 120), requester_city: p.city?.slice(0, 80) ?? null,
    requester_ip_hash: p.ipHash ?? null, requester_session_hash: p.sessionHash ?? null, match_code: code,
    expires_at: new Date(Date.now() + REQUEST_TTL_MS).toISOString(),
  }).select('id, expires_at').single();
  if (error || !data) throw new Error('stepup request');
  if (p.userId) await log(db, p.userId, 'stepup_requested', { id: data.id, purpose: p.purpose, kind: p.kind ?? 'ops' });
  return { id: data.id as string, expiresAt: data.expires_at as string, binding, approveToken: approve, matchCode: code };
}

type ReqRow = { id: string; kind: RequestKind; user_id: string | null; purpose: string; status: string; expires_at: string; requester_label: string | null; requester_city: string | null; requester_binding_hash: string; requester_session_hash: string | null; approve_token_hash: string; match_code: string | null; match_failures: number; method: string | null; created_at: string };
export async function loadReq(db: SupabaseClient, id: string): Promise<ReqRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await db.from('stepup_requests').select('id,kind,user_id,purpose,status,expires_at,requester_label,requester_city,requester_binding_hash,requester_session_hash,approve_token_hash,match_code,match_failures,method,created_at').eq('id', id).maybeSingle();
  return (data as ReqRow | null) ?? null;
}
const expired = (r: ReqRow) => Date.parse(r.expires_at) < Date.now();
/** The approver may act on a request only with the QR secret, and only for their own account (login: any signed-in approver). */
const approverMay = (r: ReqRow | null, approverId: string, token: string): r is ReqRow =>
  !!r && r.approve_token_hash === sha(token ?? '') && (r.kind === 'login' ? r.user_id === null || r.user_id === approverId : r.user_id === approverId);

/** Phone side: what is being approved. Never returns the match code itself, only 3 choices. */
export async function describeForApprover(db: SupabaseClient, approverId: string, id: string, approveToken: string) {
  const r = await loadReq(db, id);
  if (!approverMay(r, approverId, approveToken)) return null;
  const status = expired(r) && r.status === 'pending' ? 'expired' : r.status;
  return { id: r.id, kind: r.kind, purpose: r.purpose, status, requester: r.requester_label, city: r.requester_city, created_at: r.created_at, expires_at: r.expires_at, choices: status === 'pending' && r.match_code ? matchChoices(r.match_code) : [] };
}

export type DecideResult = 'ok' | 'gone' | 'wrong_number' | 'reported';
/**
 * Phone side. `approve` must be called only AFTER a fresh passkey assertion by `approverId` (own enrolled device).
 * action: approve (needs the right number) | deny | report ("זה לא אני": cancels + security event).
 */
export async function decide(db: SupabaseClient, approverId: string, id: string, approveToken: string, action: 'approve' | 'deny' | 'report', approverLabel: string, pick?: string): Promise<DecideResult> {
  const r = await loadReq(db, id);
  if (!approverMay(r, approverId, approveToken) || r.status !== 'pending' || expired(r)) return 'gone';
  const now = new Date().toISOString();
  if (action === 'approve' && pick !== r.match_code) {
    const misses = r.match_failures + 1;
    const report = misses >= MATCH_MAX_MISSES;
    await db.from('stepup_requests').update({ match_failures: misses, ...(report ? { status: 'reported', decided_at: now } : {}) }).eq('id', id).eq('status', 'pending');
    await log(db, approverId, 'stepup_number_mismatch', { id, purpose: r.purpose, misses });
    if (report) await securityEvent(db, 'stepup_number_mismatch', { user: approverId, request: id, purpose: r.purpose, requester: r.requester_label, city: r.requester_city });
    return report ? 'reported' : 'wrong_number';
  }
  const status = action === 'approve' ? 'approved' : action === 'report' ? 'reported' : 'denied';
  const { data } = await db.from('stepup_requests').update({
    status, method: action === 'approve' ? 'phone_passkey' : null, approver_device_label: approverLabel.slice(0, 120), decided_at: now,
    ...(r.kind === 'login' && action === 'approve' ? { user_id: approverId } : {}),
  }).eq('id', id).eq('status', 'pending').select('id');
  if (!data?.length) return 'gone';
  await log(db, approverId, `stepup_${status}_phone`, { id, purpose: r.purpose, kind: r.kind });
  if (action === 'report') await securityEvent(db, 'stepup_not_me', { user: approverId, request: id, purpose: r.purpose, kind: r.kind, requester: r.requester_label, city: r.requester_city });
  return 'ok';
}

/**
 * Requesting side: poll. Must present the binding cookie and (if it was signed in) the same auth session.
 * On approval, atomically consume. ops/user → grant; login → the approved userId (caller mints the session).
 */
export async function pollRequest(db: SupabaseClient, userId: string | null, id: string, binding: string | null, sessHash: string | null = null) {
  const r = await loadReq(db, id);
  if (!r || !binding || r.requester_binding_hash !== sha(binding)) return { status: 'not_found' as const };
  if (r.kind === 'login' ? userId !== null : r.user_id !== userId) return { status: 'not_found' as const };
  if (r.requester_session_hash && r.requester_session_hash !== sessHash) return { status: 'not_found' as const };
  if (r.status === 'pending') return { status: expired(r) ? ('expired' as const) : ('pending' as const) };
  if (r.status !== 'approved') return { status: (r.status === 'reported' ? 'denied' : r.status) as 'denied' | 'consumed' | 'expired' };
  const { data } = await db.from('stepup_requests').update({ status: 'consumed', consumed_at: new Date().toISOString() }).eq('id', id).eq('status', 'approved').select('id');
  if (!data?.length || !r.user_id) return { status: 'consumed' as const };
  if (r.kind === 'login') return { status: 'approved' as const, userId: r.user_id, purpose: r.purpose, grant: null };
  const grant = await issueGrant(db, r.user_id, r.purpose, 'phone_passkey');
  return { status: 'approved' as const, grant, purpose: r.purpose, userId: r.user_id };
}

/* ── grants ── */
export async function issueGrant(db: SupabaseClient, userId: string, purpose: string, method: StepUpMethod): Promise<string> {
  const secret = tok();
  const { error } = await db.from('stepup_grants').insert({ user_id: userId, purpose, binding_hash: sha(secret), method, expires_at: new Date(Date.now() + GRANT_TTL_MS).toISOString() });
  if (error) throw new Error('grant');
  await log(db, userId, 'stepup_granted', { purpose, method });
  return secret;
}

/** Consume a grant (single use). Use from any sensitive route. */
export async function consumeGrant(db: SupabaseClient, userId: string, purpose: string, cookie: string | null): Promise<{ ok: true; method: string } | { ok: false }> {
  if (!cookie) return { ok: false };
  const { data } = await db.from('stepup_grants').update({ used_at: new Date().toISOString() })
    .eq('binding_hash', sha(cookie)).eq('user_id', userId).eq('purpose', purpose).is('used_at', null).gt('expires_at', new Date().toISOString())
    .select('method');
  const row = (data as Array<{ method: string }> | null)?.[0];
  return row ? { ok: true, method: row.method } : { ok: false };
}

export async function requireStepUp(request: Request, db: SupabaseClient, userId: string, purpose: string) {
  const g = await consumeGrant(db, userId, purpose, readCookieFrom(request, STEPUP_COOKIE));
  if (g.ok) return { ok: true as const, method: g.method };
  const { NextResponse } = await import('next/server');
  return { ok: false as const, response: NextResponse.json({ error: 'stepup_required', purpose }, { status: 401, headers: { 'Cache-Control': 'no-store' } }) };
}

/* ── TOTP ── */
const totpCtx = (userId: string) => `admin-totp:${userId}`;
export async function totpStatus(db: SupabaseClient, userId: string) {
  const { data } = await db.from('admin_totp').select('confirmed_at').eq('user_id', userId).maybeSingle();
  return { enrolled: !!(data as { confirmed_at: string | null } | null)?.confirmed_at };
}
export async function totpBeginEnroll(db: SupabaseClient, userId: string, account: string) {
  const st = await totpStatus(db, userId);
  if (st.enrolled) return null; // replacing an active factor needs explicit reset (step-up) — not via enroll
  const secret = newTotpSecret();
  await db.from('admin_totp').upsert({ user_id: userId, secret_enc: encryptString(secret, totpCtx(userId)), confirmed_at: null, last_step: 0, failures: 0, locked_until: null });
  return { secret, uri: otpauthUri(secret, account) };
}
export async function totpCheck(db: SupabaseClient, userId: string, code: string, opts: { confirm?: boolean } = {}): Promise<{ ok: true } | { ok: false; locked?: boolean }> {
  const { data } = await db.from('admin_totp').select('secret_enc, confirmed_at, last_step, failures, locked_until').eq('user_id', userId).maybeSingle();
  const r = data as { secret_enc: string; confirmed_at: string | null; last_step: number; failures: number; locked_until: string | null } | null;
  if (!r || (!opts.confirm && !r.confirmed_at)) return { ok: false };
  if (r.locked_until && Date.parse(r.locked_until) > Date.now()) return { ok: false, locked: true };
  let step: number | null = null;
  try { step = verifyTotp(decryptString(r.secret_enc, totpCtx(userId)), code); } catch { step = null; }
  if (step === null || step <= Number(r.last_step)) {
    const f = r.failures + 1; const lock = f >= TOTP_MAX_FAILS;
    await db.from('admin_totp').update({ failures: lock ? 0 : f, locked_until: lock ? new Date(Date.now() + TOTP_LOCK_MIN * 60_000).toISOString() : null }).eq('user_id', userId);
    await log(db, userId, lock ? 'stepup_totp_locked' : 'stepup_totp_failed', {});
    return { ok: false, locked: lock };
  }
  // compare-and-swap on last_step = replay protection
  const { data: upd } = await db.from('admin_totp').update({ last_step: step, failures: 0, locked_until: null, ...(opts.confirm ? { confirmed_at: new Date().toISOString() } : {}) })
    .eq('user_id', userId).eq('last_step', r.last_step).select('user_id');
  if (!upd?.length) return { ok: false };
  if (opts.confirm) await log(db, userId, 'stepup_totp_enrolled', {});
  return { ok: true };
}

/** Non-consuming check (for status endpoints / GET). */
export async function peekGrant(db: SupabaseClient, userId: string, purpose: string, cookie: string | null): Promise<boolean> {
  if (!cookie) return false;
  const { data } = await db.from('stepup_grants').select('id').eq('binding_hash', sha(cookie)).eq('user_id', userId).eq('purpose', purpose).is('used_at', null).gt('expires_at', new Date().toISOString()).limit(1);
  return !!data?.length;
}

/** Supabase session id from an access token (claim `session_id`), for binding a request to the requesting session. */
export function sessionIdOf(accessToken: string | null | undefined): string | null {
  try { const p = JSON.parse(Buffer.from((accessToken ?? '').split('.')[1] ?? '', 'base64url').toString('utf8')) as { session_id?: string }; return p.session_id ?? null; } catch { return null; }
}
