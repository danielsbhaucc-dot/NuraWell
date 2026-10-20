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
export const REQUEST_TTL_MS = 3 * 60_000;
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

/* ── cross-device request ── */
export async function createRequest(db: SupabaseClient, p: { userId: string; purpose: string; deviceId: string | null; label: string }) {
  const binding = tok(); const approve = tok();
  const { data, error } = await db.from('stepup_requests').insert({
    user_id: p.userId, purpose: p.purpose, requester_binding_hash: sha(binding), approve_token_hash: sha(approve),
    requester_device_id: p.deviceId, requester_label: p.label.slice(0, 120), expires_at: new Date(Date.now() + REQUEST_TTL_MS).toISOString(),
  }).select('id, expires_at').single();
  if (error || !data) throw new Error('stepup request');
  await log(db, p.userId, 'stepup_requested', { id: data.id, purpose: p.purpose });
  return { id: data.id as string, expiresAt: data.expires_at as string, binding, approveToken: approve };
}

type ReqRow = { id: string; user_id: string; purpose: string; status: string; expires_at: string; requester_label: string | null; requester_binding_hash: string; approve_token_hash: string; method: string | null; created_at: string };
async function loadReq(db: SupabaseClient, id: string): Promise<ReqRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await db.from('stepup_requests').select('id,user_id,purpose,status,expires_at,requester_label,requester_binding_hash,approve_token_hash,method,created_at').eq('id', id).maybeSingle();
  return (data as ReqRow | null) ?? null;
}
const expired = (r: ReqRow) => Date.parse(r.expires_at) < Date.now();

/** Phone side: what is being approved (only for the same admin, with the QR secret). */
export async function describeForApprover(db: SupabaseClient, userId: string, id: string, approveToken: string) {
  const r = await loadReq(db, id);
  if (!r || r.user_id !== userId || r.approve_token_hash !== sha(approveToken ?? '')) return null;
  return { id: r.id, purpose: r.purpose, status: expired(r) && r.status === 'pending' ? 'expired' : r.status, requester: r.requester_label, created_at: r.created_at, expires_at: r.expires_at };
}

/** Phone side: called only AFTER a fresh passkey assertion of the same admin has been verified. */
export async function decide(db: SupabaseClient, userId: string, id: string, approveToken: string, approve: boolean, approverLabel: string) {
  const r = await loadReq(db, id);
  if (!r || r.user_id !== userId || r.approve_token_hash !== sha(approveToken ?? '') || r.status !== 'pending' || expired(r)) return false;
  const { data } = await db.from('stepup_requests').update({ status: approve ? 'approved' : 'denied', method: approve ? 'phone_passkey' : null, approver_device_label: approverLabel.slice(0, 120), decided_at: new Date().toISOString() })
    .eq('id', id).eq('status', 'pending').select('id');
  const ok = !!data?.length;
  if (ok) await log(db, userId, approve ? 'stepup_approved_phone' : 'stepup_denied_phone', { id, purpose: r.purpose });
  return ok;
}

/** Desktop side: poll. On approval, atomically consume and return a grant. */
export async function pollRequest(db: SupabaseClient, userId: string, id: string, binding: string | null) {
  const r = await loadReq(db, id);
  if (!r || r.user_id !== userId || !binding || r.requester_binding_hash !== sha(binding)) return { status: 'not_found' as const };
  if (r.status === 'pending') return { status: expired(r) ? ('expired' as const) : ('pending' as const) };
  if (r.status !== 'approved') return { status: r.status as 'denied' | 'consumed' | 'expired' };
  const { data } = await db.from('stepup_requests').update({ status: 'consumed', consumed_at: new Date().toISOString() }).eq('id', id).eq('status', 'approved').select('id');
  if (!data?.length) return { status: 'consumed' as const };
  const grant = await issueGrant(db, userId, r.purpose, 'phone_passkey');
  return { status: 'approved' as const, grant, purpose: r.purpose };
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
