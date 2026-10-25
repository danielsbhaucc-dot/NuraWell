/**
 * Incident response (server only): session / IP / account actions, lockdown, recovery-code check.
 * Every action is audited to admin_audit_log (method SECURITY, path ir.<action>) with the acting session.
 * Self-protection: an admin can never ban, force-reset or sign out *all* of their own sessions here,
 * and lockdown always keeps the session that started it.
 */
import { randomBytes } from 'node:crypto';
import { BlockList, isIP } from 'node:net';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Product-agnostic core (no app imports). The product wiring calls configureIr() once with its IP hasher and
 * recovery-code settings. Tables / RPCs are the shared control-plane schema from migration 000185.
 */
export type IrConfig = { hashIp: (ip: string) => string | null; normalizeCode: (c: string) => string; recoveryMaxFails: number; recoveryLockMin: number; recoveryCodeLength: number; factorTables: string[] };
let cfg: IrConfig | null = null;
export function configureIr(c: IrConfig) { cfg = c; }
function conf(): IrConfig { if (!cfg) throw new Error('security-core: configureIr() not called'); return cfg; }
const hashIp = (ip: string) => conf().hashIp(ip);

export type Actor = { userId: string; sessionId: string | null; ipHash: string | null; ip?: string | null };
export type IrResult = { ok: true; detail?: Record<string, unknown> } | { ok: false; status: number; error: string; code?: string };

export const MAX_ALLOW_HOURS = 24;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s: unknown): s is string => typeof s === 'string' && UUID.test(s);

export async function irAudit(db: SupabaseClient, actor: Actor, action: string, detail: Record<string, unknown> = {}, incidentId?: string | null): Promise<void> {
  await db.from('admin_audit_log').insert({ actor_id: actor.userId, method: 'SECURITY', path: `ir.${action}`, detail: { ...detail, session: actor.sessionId, ip_hash: actor.ipHash } }).then(() => undefined, () => undefined);
  if (incidentId && isUuid(incidentId)) {
    const { data } = await db.from('security_incidents').select('actions').eq('id', incidentId).maybeSingle();
    const actions = Array.isArray((data as { actions?: unknown[] } | null)?.actions) ? (data as { actions: unknown[] }).actions : [];
    await db.from('security_incidents').update({ actions: [...actions, { at: new Date().toISOString(), action, ...detail }].slice(-100) }).eq('id', incidentId);
  }
}

/** Valid single IP (v4/v6) or a CIDR not wider than /16 (v4) or /32 (v6). Pure, unit-tested. */
export function parseTarget(raw: string): { kind: 'ip'; ip: string } | { kind: 'range'; cidr: string } | null {
  const s = raw.trim();
  const m = /^([0-9a-fA-F:.]+)\/(\d{1,3})$/.exec(s);
  if (m) {
    const fam = isIP(m[1]);
    const bits = Number(m[2]);
    if (!fam) return null;
    if (fam === 4 && (bits < 16 || bits > 32)) return null;
    if (fam === 6 && (bits < 32 || bits > 128)) return null;
    return { kind: 'range', cidr: `${m[1]}/${bits}` };
  }
  return isIP(s) ? { kind: 'ip', ip: s } : null;
}

export function cidrContains(cidr: string, ip: string | null | undefined): boolean {
  if (!ip || !isIP(ip)) return false;
  const [net, bits] = cidr.split('/');
  const fam = isIP(net);
  if (!fam || fam !== isIP(ip)) return false;
  const bl = new BlockList();
  bl.addSubnet(net, Number(bits), fam === 4 ? 'ipv4' : 'ipv6');
  return bl.check(ip, fam === 4 ? 'ipv4' : 'ipv6');
}

/** Duration in minutes → timestamp; null = permanent ('infinity'). */
export function untilFrom(minutes: number | null, now = Date.now()): string {
  return minutes == null ? 'infinity' : new Date(now + Math.max(5, Math.min(minutes, 525_600)) * 60_000).toISOString();
}

export async function revokeSession(db: SupabaseClient, actor: Actor, sessionId: string, incidentId?: string | null): Promise<IrResult> {
  if (!isUuid(sessionId)) return { ok: false, status: 400, error: 'מזהה חיבור לא תקין' };
  if (sessionId === actor.sessionId) return { ok: false, status: 409, error: 'זה החיבור שלך עכשיו. אי אפשר לנתק אותו מכאן.', code: 'self_session' };
  const { data, error } = await db.rpc('ops_revoke_session', { p_session: sessionId });
  if (error) return { ok: false, status: 500, error: 'הניתוק נכשל' };
  await irAudit(db, actor, 'revoke_session', { target_session: sessionId, removed: data }, incidentId);
  return { ok: true, detail: { removed: data } };
}

export async function signOutAll(db: SupabaseClient, actor: Actor, userId: string, incidentId?: string | null): Promise<IrResult> {
  if (!isUuid(userId)) return { ok: false, status: 400, error: 'מזהה חשבון לא תקין' };
  // own account: keep the current session (same as lockdown), never a full self sign-out
  const keep = userId === actor.userId ? actor.sessionId : null;
  if (userId === actor.userId && !keep) return { ok: false, status: 409, error: 'לא זוהה החיבור הנוכחי שלך, לכן לא ניתקתי.', code: 'self_session' };
  const { data, error } = await db.rpc('ops_revoke_other_sessions', { p_user: userId, p_keep: keep });
  if (error) return { ok: false, status: 500, error: 'הניתוק נכשל' };
  await irAudit(db, actor, 'sign_out_all', { target_user: userId, kept_current: !!keep, removed: data }, incidentId);
  return { ok: true, detail: { removed: data, keptCurrent: !!keep } };
}

export async function blockIp(db: SupabaseClient, actor: Actor, o: { ip?: string; ipHash?: string; minutes: number | null; note?: string }, incidentId?: string | null): Promise<IrResult> {
  const target = o.ip ? parseTarget(o.ip) : null;
  if (o.ip && !target) return { ok: false, status: 400, error: 'כתובת או טווח לא תקינים (טווח לכל היותר ‎/16)' };
  const until = untilFrom(o.minutes);
  const note = (o.note ?? '').slice(0, 200) || null;
  if (target?.kind === 'range') {
    if (cidrContains(target.cidr, actor.ip)) return { ok: false, status: 409, error: 'הכתובת שלך נמצאת בתוך הטווח הזה. לא חסמתי כדי לא לנעול אותך בחוץ.', code: 'self_ip' };
    const { error } = await db.from('ip_block_ranges').upsert({ cidr: target.cidr, created_by: actor.userId, blocked_until: until, reason: 'manual' }, { onConflict: 'cidr' });
    if (error) return { ok: false, status: 400, error: 'החסימה נכשלה' };
    await irAudit(db, actor, 'block_range', { cidr: target.cidr, until, note }, incidentId);
    return { ok: true, detail: { cidr: target.cidr, until } };
  }
  const h = target?.kind === 'ip' ? hashIp(target.ip) : (o.ipHash && /^[0-9a-f]{32}$/.test(o.ipHash) ? o.ipHash : null);
  if (!h) return { ok: false, status: 400, error: 'חסרה כתובת לחסימה' };
  if (h === actor.ipHash) return { ok: false, status: 409, error: 'זו הכתובת שממנה אתה מחובר עכשיו. לא חסמתי כדי לא לנעול אותך בחוץ.', code: 'self_ip' };
  const { error } = await db.from('ip_blocks').upsert({ ip_hash: h, created_at: new Date().toISOString(), blocked_until: until, reason: 'manual', manual: true, created_by: actor.userId, note });
  if (error) return { ok: false, status: 400, error: 'החסימה נכשלה' };
  await irAudit(db, actor, 'block_ip', { target_ip_hash: h, until, note }, incidentId);
  return { ok: true, detail: { ipHash: h, until } };
}

export async function unblock(db: SupabaseClient, actor: Actor, o: { ipHash?: string; cidr?: string }): Promise<IrResult> {
  if (o.cidr) {
    const t = parseTarget(o.cidr);
    if (t?.kind !== 'range') return { ok: false, status: 400, error: 'טווח לא תקין' };
    await db.from('ip_block_ranges').delete().eq('cidr', t.cidr);
    await irAudit(db, actor, 'unblock_range', { cidr: t.cidr });
    return { ok: true };
  }
  if (!o.ipHash || !/^[0-9a-f]{32}$/.test(o.ipHash)) return { ok: false, status: 400, error: 'חסרה כתובת' };
  await db.from('ip_blocks').delete().eq('ip_hash', o.ipHash);
  await irAudit(db, actor, 'unblock_ip', { target_ip_hash: o.ipHash });
  return { ok: true };
}

export async function listBlocks(db: SupabaseClient) {
  const now = new Date().toISOString();
  const [{ data: ips }, { data: ranges }] = await Promise.all([
    db.from('ip_blocks').select('ip_hash, created_at, blocked_until, reason, manual, note').gt('blocked_until', now).order('created_at', { ascending: false }).limit(100),
    db.from('ip_block_ranges').select('cidr, created_at, blocked_until, reason').gt('blocked_until', now).order('created_at', { ascending: false }).limit(100),
  ]);
  return { ips: ips ?? [], ranges: ranges ?? [] };
}

async function refuseSelf(actor: Actor, userId: string): Promise<IrResult | null> {
  if (!isUuid(userId)) return { ok: false, status: 400, error: 'מזהה חשבון לא תקין' };
  if (userId === actor.userId) return { ok: false, status: 409, error: 'זה החשבון שלך. כדי להגן עליו השתמש ב"נעילת חירום" ולא בחסימה עצמית.', code: 'self_account' };
  return null;
}

export async function banUser(db: SupabaseClient, actor: Actor, userId: string, hours: number | null, incidentId?: string | null): Promise<IrResult> {
  const r = await refuseSelf(actor, userId); if (r) return r;
  const ban = hours == null ? '876000h' : `${Math.max(1, Math.min(Math.round(hours), 8760))}h`;
  const { error } = await db.auth.admin.updateUserById(userId, { ban_duration: ban });
  if (error) return { ok: false, status: 400, error: 'הנעילה נכשלה' };
  await db.rpc('ops_revoke_other_sessions', { p_user: userId, p_keep: null });
  await irAudit(db, actor, 'ban_user', { target_user: userId, ban }, incidentId);
  return { ok: true, detail: { ban } };
}

export async function unbanUser(db: SupabaseClient, actor: Actor, userId: string): Promise<IrResult> {
  const r = await refuseSelf(actor, userId); if (r) return r;
  const { error } = await db.auth.admin.updateUserById(userId, { ban_duration: 'none' });
  if (error) return { ok: false, status: 400, error: 'שחרור הנעילה נכשל' };
  await irAudit(db, actor, 'unban_user', { target_user: userId });
  return { ok: true };
}

/**
 * Force password reset + MFA re-enrollment: the password is replaced with an unknown random one (an attacker's
 * known password stops working at once), all sessions end, TOTP factors, passkeys and backup codes are removed,
 * and a reset email goes to the account's own address.
 */
export async function forceReset(db: SupabaseClient, actor: Actor, userId: string, incidentId?: string | null): Promise<IrResult> {
  const r = await refuseSelf(actor, userId); if (r) return r;
  const { data: u } = await db.auth.admin.getUserById(userId);
  const email = u?.user?.email;
  if (!email) return { ok: false, status: 404, error: 'החשבון לא נמצא' };
  const { error } = await db.auth.admin.updateUserById(userId, { password: randomBytes(32).toString('base64url'), app_metadata: { ...(u.user?.app_metadata ?? {}), must_reenroll_mfa: true, forced_reset_at: new Date().toISOString() } });
  if (error) return { ok: false, status: 400, error: 'איפוס הסיסמה נכשל' };
  let factors = 0;
  const { data: fl } = await db.auth.admin.mfa.listFactors({ userId });
  for (const f of fl?.factors ?? []) { const { error: e } = await db.auth.admin.mfa.deleteFactor({ userId, id: f.id }); if (!e) factors++; }
  for (const t of conf().factorTables) await db.from(t).delete().eq('user_id', userId);
  await db.rpc('ops_revoke_other_sessions', { p_user: userId, p_keep: null });
  const { error: mailErr } = await db.auth.resetPasswordForEmail(email);
  await irAudit(db, actor, 'force_reset', { target_user: userId, factors_removed: factors, reset_email: !mailErr }, incidentId);
  return { ok: true, detail: { factorsRemoved: factors, resetEmail: !mailErr } };
}

/* ───────────── recovery code (generic, for loosening actions) ───────────── */
export async function verifyRecoveryCode(db: SupabaseClient, actor: Actor, code: string, purpose: string): Promise<{ ok: true } | { ok: false; error: string; locked?: boolean }> {
  const uid = actor.userId;
  const { data: st } = await db.from('ops_security_state').select('recovery_failures, recovery_locked_until').eq('user_id', uid).maybeSingle();
  const s = st as { recovery_failures: number; recovery_locked_until: string | null } | null;
  if (s?.recovery_locked_until && Date.parse(s.recovery_locked_until) > Date.now()) {
    await irAudit(db, actor, 'recovery_refused_locked', { purpose });
    return { ok: false, error: 'נחסם זמנית אחרי ניסיונות כושלים. נסה שוב בעוד חצי שעה.', locked: true };
  }
  const { data: hit } = conf().normalizeCode(code).length === conf().recoveryCodeLength ? await db.rpc('ops_use_recovery_code', { p_user: uid, p_code: code }) : { data: false };
  if (hit !== true) {
    const fails = (s?.recovery_failures ?? 0) + 1;
    const lock = fails >= conf().recoveryMaxFails;
    await db.from('ops_security_state').upsert({ user_id: uid, recovery_failures: lock ? 0 : fails, recovery_locked_until: lock ? new Date(Date.now() + conf().recoveryLockMin * 60_000).toISOString() : null, updated_at: new Date().toISOString() });
    await irAudit(db, actor, lock ? 'recovery_locked' : 'recovery_failed', { purpose, fails });
    return { ok: false, error: lock ? 'נחסם ל-30 דקות אחרי 5 ניסיונות כושלים.' : 'קוד השחזור לא תקין.', locked: lock };
  }
  await db.from('ops_security_state').upsert({ user_id: uid, recovery_failures: 0, recovery_locked_until: null, updated_at: new Date().toISOString() });
  await irAudit(db, actor, 'recovery_code_used', { purpose });
  return { ok: true };
}

/* ───────────── lockdown ───────────── */
export type Lockdown = { active: boolean; started_at: string | null; started_by: string | null; keep_session: string | null; allow_ip_hash: string | null; allowlist_until: string | null; ended_at: string | null; ended_via: string | null };
let ldCache: { at: number; v: Lockdown | null } | null = null;
export function clearLockdownCache() { ldCache = null; }

export async function readLockdown(db: SupabaseClient, fresh = false): Promise<Lockdown | null> {
  if (!fresh && ldCache && Date.now() - ldCache.at < 10_000) return ldCache.v;
  const { data } = await db.from('ops_lockdown').select('*').eq('id', 1).maybeSingle();
  ldCache = { at: Date.now(), v: (data as Lockdown | null) ?? null };
  return ldCache.v;
}

/** Paths that must stay reachable during lockdown, so the owner can always step up or recover. */
export const LOCKDOWN_EXEMPT = ['/api/v1/ops/stepup', '/api/v1/ops/device', '/api/v1/ops/security/recover'];

/** Pure decision (unit-tested). */
export function lockdownDecision(ld: Lockdown | null, o: { path: string; ipHash: string | null; steppedUp: boolean; now?: number }): null | { code: 'lockdown_ip' | 'lockdown_stepup'; error: string } {
  if (!ld?.active) return null;
  if (LOCKDOWN_EXEMPT.some((p) => o.path === p || o.path.startsWith(`${p}/`))) return null;
  const now = o.now ?? Date.now();
  const allowOn = !!ld.allow_ip_hash && !!ld.allowlist_until && Date.parse(ld.allowlist_until) > now;
  if (allowOn && o.ipHash !== ld.allow_ip_hash) return { code: 'lockdown_ip', error: 'נעילת חירום פעילה: ממשק הניהול פתוח רק מהכתובת שאישרת. להסרה השתמש בקוד שחזור.' };
  if (!o.steppedUp) return { code: 'lockdown_stepup', error: 'נעילת חירום פעילה: כל פעולה דורשת אימות נוסף.' };
  return null;
}

export async function startLockdown(db: SupabaseClient, actor: Actor, allowHours: number | null): Promise<IrResult> {
  if (!actor.sessionId) return { ok: false, status: 409, error: 'לא זוהה החיבור הנוכחי, לכן לא הפעלתי נעילה (כדי לא לנתק אותך).', code: 'self_session' };
  const hours = allowHours == null ? null : Math.max(1, Math.min(Math.round(allowHours), MAX_ALLOW_HOURS));
  if (hours && !actor.ipHash) return { ok: false, status: 409, error: 'לא זוהתה הכתובת שלך, לכן אי אפשר להגביל לכתובת.' };
  const { data: admins } = await db.from('profiles').select('id').eq('role', 'admin').limit(10);
  let removed = 0;
  for (const a of (admins ?? []) as { id: string }[]) {
    const { data } = await db.rpc('ops_revoke_other_sessions', { p_user: a.id, p_keep: a.id === actor.userId ? actor.sessionId : null });
    removed += Number(data ?? 0);
  }
  const row = { id: 1, active: true, started_at: new Date().toISOString(), started_by: actor.userId, keep_session: actor.sessionId, allow_ip_hash: hours ? actor.ipHash : null, allowlist_until: hours ? new Date(Date.now() + hours * 3_600_000).toISOString() : null, ended_at: null, ended_via: null };
  const { error } = await db.from('ops_lockdown').upsert(row);
  if (error) return { ok: false, status: 500, error: 'הפעלת הנעילה נכשלה' };
  clearLockdownCache();
  await irAudit(db, actor, 'lockdown_start', { sessions_removed: removed, allow_hours: hours });
  return { ok: true, detail: { removed, allowHours: hours } };
}

export async function endLockdown(db: SupabaseClient, actor: Actor, via: string): Promise<IrResult> {
  const { error } = await db.from('ops_lockdown').update({ active: false, allow_ip_hash: null, allowlist_until: null, ended_at: new Date().toISOString(), ended_via: via.slice(0, 40) }).eq('id', 1);
  if (error) return { ok: false, status: 500, error: 'שחרור הנעילה נכשל' };
  clearLockdownCache();
  await irAudit(db, actor, 'lockdown_end', { via });
  return { ok: true };
}
