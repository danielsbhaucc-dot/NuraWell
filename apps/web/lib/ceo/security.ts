import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { publicAppBaseNoSlashSync } from '@/lib/public-app-url';
import { deviceSecretDigest, verifyInitData } from './miniapp';

/**
 * Gideon stolen-phone protection.
 * - Routine approvals: one tap in Telegram.
 * - Sensitive (deletes, permission/security, bulk, kill-switch off): Face ID inside Telegram (Mini App
 *   BiometricManager) via a one-time Mini App button bound to the action and the chat, then a trust window.
 * - Devices are registered only after Daniel approves the request in Ops (admin login); Gideon never sends links.
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
  const { data } = await db.from('admin_passkeys').select('id, activated_at');
  const now = Date.now();
  return (data ?? []).some((k: { activated_at?: string | null }) => !k.activated_at || Date.parse(k.activated_at) <= now);
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

/** Mini App lives on the public app host (never the Ops host). */
export function miniAppBase(): string {
  return (process.env.CEO_MINIAPP_BASE || publicAppBaseNoSlashSync() || 'https://nurawell.vercel.app').replace(/\/$/, '');
}
const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');
const b64u = (b: Buffer) => b.toString('base64url');

export type Purpose = 'approve' | 'unlock' | 'register' | 'settings' | 'remove_key';
/** One-time Mini App URL (10 min) bound to purpose (+ action / Telegram user). Only its hash is stored. */
export async function createStepupLink(
  db: SupabaseClient,
  purpose: Purpose,
  opts: { actionId?: string; userId?: string; payload?: Record<string, unknown> } = {},
) {
  const token = b64u(randomBytes(32));
  const { error } = await db.from('webauthn_challenges').insert({
    purpose,
    action_id: opts.actionId ?? null,
    user_id: opts.userId ?? null,
    token_hash: hashToken(token),
    payload: opts.payload ?? null,
    expires_at: new Date(Date.now() + LINK_TTL_MS).toISOString(),
  });
  if (error) throw new Error(error.message);
  return `${miniAppBase()}/gideon/app?t=${token}`;
}

type ChallengeRow = { id: string; purpose: string; action_id: string | null; user_id: string | null; expires_at: string; used_at: string | null; payload: Record<string, unknown> | null };
async function loadLink(db: SupabaseClient, token: string): Promise<ChallengeRow | null> {
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return null;
  const { data } = await db.from('webauthn_challenges').select('id, purpose, action_id, user_id, expires_at, used_at, payload').eq('token_hash', hashToken(token)).maybeSingle();
  const r = data as ChallengeRow | null;
  if (!r || r.used_at || Date.parse(r.expires_at) <= Date.now()) return null;
  return r;
}

/** initData must be signed by our bot, fresh, from an allowlisted Telegram user, and (if bound) the same user. */
function checkTelegram(initData: string, botToken: string | null, allowed: Set<string>, boundTo?: unknown): string | null {
  if (!botToken) return null;
  const v = verifyInitData(initData, botToken);
  if (!v || !allowed.has(v.userId)) return null;
  if (boundTo && String(boundTo) !== v.userId) return null;
  return v.userId;
}

/** What the Mini App shows before Face ID (Hebrew summary only, no internal links). */
export async function linkInfo(db: SupabaseClient, token: string) {
  const r = await loadLink(db, token);
  if (!r) return null;
  let summary: string | null = null;
  if (r.action_id) {
    const { data } = await db.from('ceo_pending_actions').select('summary').eq('id', r.action_id).maybeSingle();
    summary = (data as { summary?: string } | null)?.summary ?? null;
  }
  if (r.purpose === 'settings') summary = `שינוי הגדרות אבטחה: חלון אמון ${r.payload?.trust_minutes} דק׳, אימות תקופתי ${r.payload?.reverify_minutes} דק׳`;
  if (r.purpose === 'remove_key') summary = `הסרת מכשיר: ${String(r.payload?.label ?? '')}`;
  if (r.purpose === 'unlock') summary = 'שחרור גדעון והפעלה מחדש';
  if (r.purpose === 'register') summary = r.payload?.replace ? 'רישום Face ID במכשיר החדש (המכשירים הקודמים יוסרו)' : 'רישום Face ID במכשיר הזה';
  return { purpose: r.purpose, summary };
}

/** Atomically consume a link (single use → replay-protected). */
async function consume(db: SupabaseClient, id: string): Promise<boolean> {
  const { data } = await db.from('webauthn_challenges').update({ used_at: new Date().toISOString() }).eq('id', id).is('used_at', null).select('id');
  return Boolean(data?.length);
}

/**
 * Register this phone: server creates a 256-bit device secret, the Mini App stores it in Telegram's
 * biometric storage (Face ID) and only its digest is kept here. replace → older devices are removed.
 */
export async function registerDevice(db: SupabaseClient, token: string, initData: string, botToken: string | null, allowed: Set<string>, label: string) {
  const r = await loadLink(db, token);
  if (!r || r.purpose !== 'register') return { ok: false as const, error: 'הקישור לא תקף או שפג תוקפו.' };
  const tgUser = checkTelegram(initData, botToken, allowed, r.payload?.telegramUserId);
  if (!tgUser) return { ok: false as const, error: 'אפשר לרשום רק מתוך הצ׳אט המאומת של דניאל.' };
  if (!(await consume(db, r.id))) return { ok: false as const, error: 'הקישור כבר נוצל.' };
  const secret = b64u(randomBytes(32));
  const deviceId = b64u(randomBytes(16));
  const now = new Date().toISOString();
  const { error } = await db.from('admin_passkeys').insert({
    user_id: r.user_id, credential_id: deviceId, public_key: deviceSecretDigest(secret), alg: 0, kind: 'tg_bio',
    telegram_user_id: tgUser, label: label.slice(0, 60), activated_at: '9999-12-31T00:00:00Z', replaces_before: r.payload?.replace ? now : null,
  });
  if (error) {
    console.error('[ceo-device] register', error.message);
    return { ok: false as const, error: 'הרישום נכשל.' };
  }
  await audit(db, `tg:${tgUser}`, 'device_registered_pending', { label });
  return { ok: true as const, deviceId, secret };
}

/** After the phone saved the secret behind Face ID: activate, and (device change) remove the older devices. */
export async function confirmDevice(db: SupabaseClient, initData: string, botToken: string | null, allowed: Set<string>, deviceId: string, secret: string) {
  const tgUser = checkTelegram(initData, botToken, allowed);
  if (!tgUser) return false;
  const { data } = await db.from('admin_passkeys').select('id, public_key, telegram_user_id, replaces_before, created_at').eq('credential_id', deviceId).maybeSingle();
  const k = data as { id: string; public_key: string; telegram_user_id: string; replaces_before: string | null; created_at: string } | null;
  if (!k || k.telegram_user_id !== tgUser) return false;
  const a = Buffer.from(deviceSecretDigest(secret));
  const b = Buffer.from(k.public_key);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  if (Date.now() - Date.parse(k.created_at) > LINK_TTL_MS) return false;
  await db.from('admin_passkeys').update({ activated_at: new Date().toISOString() }).eq('id', k.id);
  if (k.replaces_before) await db.from('admin_passkeys').delete().neq('id', k.id);
  await audit(db, `tg:${tgUser}`, 'device_activated', { replaced: Boolean(k.replaces_before) });
  return true;
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

export type StepupBody = { initData: string; deviceId: string; secret: string };

/** Verify Face ID (device secret released by Telegram biometric storage) for a link; opens the trust window. */
export async function verifyStepup(db: SupabaseClient, token: string, body: StepupBody, botToken: string | null, allowed: Set<string>, alert?: (text: string) => Promise<void>) {
  const r = await loadLink(db, token);
  if (!r || r.purpose === 'register') return { ok: false as const, error: 'הקישור לא תקף או שפג תוקפו.' };
  const s = await securityState(db);
  if (r.purpose !== 'unlock' && s.locked_until && Date.parse(s.locked_until) > Date.now()) return { ok: false as const, error: 'גדעון נעול זמנית.' };
  try {
    const tgUser = checkTelegram(body.initData, botToken, allowed);
    if (!tgUser) throw new Error('bad initData / chat');
    const { data: key } = await db.from('admin_passkeys').select('id, public_key, telegram_user_id, activated_at').eq('credential_id', body.deviceId).maybeSingle();
    const k = key as { id: string; public_key: string; telegram_user_id: string | null; activated_at: string } | null;
    if (!k || Date.parse(k.activated_at) > Date.now()) throw new Error('unknown device');
    if (k.telegram_user_id && k.telegram_user_id !== tgUser) throw new Error('device of another chat');
    const a = Buffer.from(deviceSecretDigest(body.secret));
    const b = Buffer.from(k.public_key);
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error('bad device secret');
    if (!(await consume(db, r.id))) throw new Error('link already used');
    await db.from('admin_passkeys').update({ last_used_at: new Date().toISOString() }).eq('id', k.id);
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
  await audit(db, 'faceid', `stepup_ok_${r.purpose}`, r.payload ?? {}, r.action_id ?? undefined);
  return { ok: true as const, purpose: r.purpose, actionId: r.action_id };
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

/** Telegram asks for a (new) device → pending request in Ops. No link is sent until Daniel approves there. */
export async function requestDevice(db: SupabaseClient, chatId: string, replace: boolean) {
  const { data: open } = await db.from('gideon_device_requests').select('id').eq('status', 'pending').eq('chat_id', chatId).limit(1);
  if (open?.length) return { id: (open[0] as { id: string }).id, existing: true };
  const { data, error } = await db.from('gideon_device_requests').insert({ chat_id: chatId, replace }).select('id').single();
  if (error) throw new Error(error.message);
  await audit(db, `tg:${chatId}`, 'device_requested', { replace });
  return { id: (data as { id: string }).id, existing: false };
}

/** Ops approves → returns the one-time Mini App registration URL (to be sent to that chat as a web_app button). */
export async function approveDeviceRequest(db: SupabaseClient, id: string, adminId: string) {
  const { data } = await db.from('gideon_device_requests').update({ status: 'approved', decided_at: new Date().toISOString(), decided_by: adminId }).eq('id', id).eq('status', 'pending').select('chat_id, replace').maybeSingle();
  const r = data as { chat_id: string; replace: boolean } | null;
  if (!r) return null;
  const url = await createStepupLink(db, 'register', { userId: adminId, payload: { replace: r.replace, telegramUserId: r.chat_id } });
  await audit(db, `ops:${adminId}`, 'device_request_approved', { replace: r.replace });
  return { chatId: r.chat_id, url, replace: r.replace };
}
