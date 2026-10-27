import { createHash, randomBytes, randomInt } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { timingSafeEqualStr } from '@/lib/api/timing-safe-equal';
import { consumeRateLimit } from '@/lib/api/rate-limit';
import type { CeoChannel } from './channel';
import { allowedChatIds } from './channel';

/**
 * Verify-before-block for unknown Telegram senders (server-side only, never the model).
 * An unknown numeric from.id in a private 1:1 chat gets ONE neutral prompt; a 6-digit one-time code
 * goes to the owner's verified email (and Ops can approve with step-up). TTL 10 min, max 3 attempts.
 * While pending: no data, no AI, no tools. Success → from.id allowlisted. Failure/timeout → blocked,
 * total silence to that id; only Ops can unblock.
 */
export const VERIFY_TTL_MS = 10 * 60_000;
export const VERIFY_MAX_ATTEMPTS = 3;
export const PROMPT = 'כדי להמשיך, הקלד את קוד האימות.';
export const WRONG = 'הקוד שגוי.';
export const OK_MSG = '✅ אומת.';

export type IdentityRow = { from_id: string; status: 'pending' | 'allowed' | 'blocked'; code_hash: string | null; code_salt: string | null; expires_at: string | null; attempts: number; created_at?: string };
type Tg = { message?: { chat: { id: number; type?: string }; from?: { id: number; is_bot?: boolean }; text?: string }; callback_query?: { id: string; from?: { id: number; is_bot?: boolean }; message?: { chat: { id: number; type?: string } } } };

export type VerifyDeps = {
  sendCode?: (db: SupabaseClient, code: string, fromTail: string) => Promise<boolean>;
  now?: () => Date;
  genCode?: () => string;
};

const T = 'gideon_telegram_identities';
const tail = (id: string) => id.slice(-4);
export const hashCode = (salt: string, fromId: string, code: string) => createHash('sha256').update(`gideon-tg-verify:${salt}:${fromId}:${code}`).digest('hex');

/** Verified extra senders (status allowed). Errors → empty set (fail closed). */
export async function verifiedFromIds(db: SupabaseClient): Promise<Set<string>> {
  try {
    const { data } = await db.from(T).select('from_id').eq('status', 'allowed');
    return new Set(((data ?? []) as { from_id: string }[]).map((r) => r.from_id).filter((s) => /^\d{1,20}$/.test(s)));
  } catch {
    return new Set();
  }
}

async function load(db: SupabaseClient, fromId: string): Promise<IdentityRow | null> {
  const { data } = await db.from(T).select('from_id, status, code_hash, code_salt, expires_at, attempts, created_at').eq('from_id', fromId).maybeSingle();
  return (data as IdentityRow | null) ?? null;
}

async function auditEv(db: SupabaseClient, event: string, detail: Record<string, unknown>) {
  await db.from('ceo_audit_log').insert({ actor: 'telegram', event, detail }).then(() => null, () => null);
}

/** Owner = primary env allowlist (never the sender being verified). */
async function notifyOwner(channel: CeoChannel, text: string, exclude: string) {
  for (const id of allowedChatIds()) {
    if (id === exclude) continue;
    await channel.send(id, text, undefined, { kind: 'security' }).catch(() => {});
  }
}

async function block(db: SupabaseClient, channel: CeoChannel, fromId: string, reason: 'failed' | 'timeout', now: Date) {
  await db.from(T).update({ status: 'blocked', code_hash: null, code_salt: null, expires_at: null, decided_at: now.toISOString(), decided_by: 'system', reason }).eq('from_id', fromId);
  await auditEv(db, 'telegram_identity_blocked', { from_tail: tail(fromId), reason });
  await notifyOwner(channel, `🚫 חשבון טלגרם לא מוכר (מסתיים ב-${tail(fromId)}) ${reason === 'timeout' ? 'לא השלים אימות בזמן' : 'נכשל 3 פעמים באימות'} ונחסם. גדעון לא יענה לו יותר. שחרור רק מ-Ops ← גדעון ← אבטחה.`, fromId);
}

/** The private 1:1 sender id when the update is a candidate for verification, else null. */
export function candidateFromId(u: Tg): string | null {
  const chat = u.message?.chat ?? u.callback_query?.message?.chat;
  const from = u.message?.from ?? u.callback_query?.from;
  if (!chat || !from || from.is_bot || chat.type !== 'private') return null;
  const f = String(from.id);
  return /^\d{1,20}$/.test(f) && f === String(chat.id) ? f : null;
}

export type VerifyOutcome = 'silent' | 'prompted' | 'wrong' | 'verified' | 'blocked';

/** Handle one update from an unknown (not allowlisted, not verified) private sender. */
export async function handleUnknownSender(db: SupabaseClient, channel: CeoChannel, u: Tg, deps: VerifyDeps = {}): Promise<VerifyOutcome> {
  const fromId = candidateFromId(u);
  if (!fromId || allowedChatIds().has(fromId)) return 'silent';
  const now = deps.now?.() ?? new Date();
  if (u.callback_query) {
    await channel.ack({ callbackId: u.callback_query.id, chatId: fromId }).catch(() => {});
  }
  let row = await load(db, fromId).catch(() => null);
  if (row?.status === 'blocked' || row?.status === 'allowed') return 'silent'; // allowed never reaches here

  if (row && row.expires_at && Date.parse(row.expires_at) <= now.getTime()) {
    await block(db, channel, fromId, 'timeout', now);
    return 'blocked';
  }

  if (!row) {
    // email-flood guard: per sender once a day, globally 5/hour. Over the limit → silent, no state.
    const per = await consumeRateLimit({ key: fromId, namespace: 'ceo-verify-start', limit: 1, windowSeconds: 86_400 });
    const glob = await consumeRateLimit({ key: 'all', namespace: 'ceo-verify-start-all', limit: 5, windowSeconds: 3_600 });
    if (!per.ok || !glob.ok) return 'silent';
    const code = deps.genCode?.() ?? String(randomInt(0, 1_000_000)).padStart(6, '0');
    const salt = randomBytes(16).toString('hex');
    const ins = await db.from(T).insert({ from_id: fromId, status: 'pending', code_hash: hashCode(salt, fromId, code), code_salt: salt, expires_at: new Date(now.getTime() + VERIFY_TTL_MS).toISOString(), attempts: 0 });
    if ((ins as { error?: unknown }).error) return 'silent'; // race: another update created it
    const { invalidateTrust } = await import('./security');
    await invalidateTrust(db, 'unknown telegram sender').catch(() => {});
    const sent = await (deps.sendCode ?? sendOwnerCodeEmail)(db, code, tail(fromId)).catch(() => false);
    await auditEv(db, 'telegram_identity_challenge', { from_tail: tail(fromId), email_sent: sent });
    await notifyOwner(channel, `🔐 חשבון טלגרם חדש (מסתיים ב-${tail(fromId)}) ביקש לדבר עם גדעון. ${sent ? 'שלחתי קוד חד-פעמי למייל שלך' : 'המייל לא נשלח'} (10 דקות). אם זה אתה: הקלד את הקוד בחשבון החדש, או אשר ב-Ops ← גדעון ← אבטחה. אם זה לא אתה: אל תעשה כלום, הוא ייחסם לבד.`, fromId);
    await channel.send(fromId, PROMPT, undefined, { kind: 'reply' }).catch(() => {});
    return 'prompted';
  }

  // pending
  const text = u.message?.text?.trim() ?? '';
  if (!/^\d{6}$/.test(text)) {
    if (u.callback_query) return 'silent';
    const r = await consumeRateLimit({ key: fromId, namespace: 'ceo-verify-prompt', limit: 1, windowSeconds: 60 });
    if (r.ok) await channel.send(fromId, PROMPT, undefined, { kind: 'reply' }).catch(() => {});
    return 'prompted';
  }
  const good = !!row.code_hash && !!row.code_salt && timingSafeEqualStr(hashCode(row.code_salt, fromId, text), row.code_hash);
  if (good) {
    // conditional on still-pending + same attempt count (no double use)
    const { data } = await db.from(T).update({ status: 'allowed', code_hash: null, code_salt: null, expires_at: null, decided_at: now.toISOString(), decided_by: 'code' }).eq('from_id', fromId).eq('status', 'pending').eq('attempts', row.attempts).select('from_id');
    if (!data || !(data as unknown[]).length) return 'silent';
    await auditEv(db, 'telegram_identity_verified', { from_tail: tail(fromId), method: 'email_code' });
    await notifyOwner(channel, `✅ חשבון טלגרם חדש (מסתיים ב-${tail(fromId)}) אומת עם הקוד מהמייל ונוסף לגדעון. לא אתה? Ops ← גדעון ← אבטחה ← חסום.`, fromId);
    await channel.send(fromId, OK_MSG, undefined, { kind: 'reply' }).catch(() => {});
    return 'verified';
  }
  const attempts = row.attempts + 1;
  const { data: upd } = await db.from(T).update({ attempts }).eq('from_id', fromId).eq('status', 'pending').eq('attempts', row.attempts).select('from_id');
  if (!upd || !(upd as unknown[]).length) return 'silent';
  await auditEv(db, 'telegram_identity_wrong_code', { from_tail: tail(fromId), attempts });
  if (attempts >= VERIFY_MAX_ATTEMPTS) {
    await block(db, channel, fromId, 'failed', now);
    return 'blocked';
  }
  await channel.send(fromId, WRONG, undefined, { kind: 'reply' }).catch(() => {});
  return 'wrong';
}

/** Owner email: GIDEON_OWNER_EMAIL, else the single Ops admin's email. Ambiguous/missing → not sent. */
export async function sendOwnerCodeEmail(db: SupabaseClient, code: string, fromTail: string): Promise<boolean> {
  let to = process.env.GIDEON_OWNER_EMAIL?.trim() || null;
  if (!to) {
    const { data } = await db.from('profiles').select('id').eq('role', 'admin').limit(2);
    const rows = (data ?? []) as { id: string }[];
    if (rows.length !== 1) return false;
    const { data: u } = await db.auth.admin.getUserById(rows[0].id);
    to = u.user?.email ?? null;
  }
  if (!to) return false;
  const { sendResendEmail } = await import('@/lib/module-api/notifications/lib-email-resend');
  const { emailCode, emailNotice, emailParagraph, renderEmailLayout } = await import('@/lib/module-api/notifications/lib-email-layout');
  const { GIDEON_EMAIL_FROM } = await import('@/lib/ops/device-notify');
  const { publicAppBaseNoSlashSync } = await import('@/lib/public-app-url');
  const subject = 'קוד אימות לחשבון טלגרם חדש בגדעון';
  const r = await sendResendEmail({
    to, from: GIDEON_EMAIL_FROM, subject, purpose: 'gideon_tg_verify',
    html: renderEmailLayout({
      preheader: subject, eyebrow: 'אבטחה', heading: subject,
      bodyHtml:
        emailParagraph(`חשבון טלגרם שמספרו מסתיים ב-${fromTail} ביקש לדבר עם גדעון. אם זה אתה, הקלד את הקוד בצ'אט עם גדעון מהחשבון החדש:`, { center: true }) +
        emailCode(code) +
        emailParagraph('הקוד תקף 10 דקות, ל-3 ניסיונות בלבד.', { muted: true, small: true, center: true }) +
        emailNotice('לא אתה? אל תעשה כלום. החשבון ייחסם אוטומטית.'),
      assetOrigin: publicAppBaseNoSlashSync() || 'https://nurawell.vercel.app',
    } as never),
    text: `קוד אימות לגדעון: ${code} (10 דקות, 3 ניסיונות). חשבון מסתיים ב-${fromTail}. לא אתה? אל תעשה כלום.`,
  });
  return r.ok;
}

/** Ops actions (route enforces admin + step-up for allow/unblock). */
export async function opsSetIdentity(db: SupabaseClient, fromId: string, action: 'allow' | 'block' | 'unblock', actor: string) {
  if (!/^\d{1,20}$/.test(fromId)) return false;
  const now = new Date().toISOString();
  if (action === 'unblock') {
    const { data } = await db.from(T).delete().eq('from_id', fromId).eq('status', 'blocked').select('from_id');
    if (!data?.length) return false;
  } else if (action === 'allow') {
    const { data } = await db.from(T).update({ status: 'allowed', code_hash: null, code_salt: null, expires_at: null, decided_at: now, decided_by: actor }).eq('from_id', fromId).eq('status', 'pending').select('from_id');
    if (!data?.length) return false;
  } else {
    const { error } = await db.from(T).upsert({ from_id: fromId, status: 'blocked', code_hash: null, code_salt: null, expires_at: null, decided_at: now, decided_by: actor, reason: 'ops' }, { onConflict: 'from_id' });
    if (error) return false;
  }
  await db.from('ceo_audit_log').insert({ actor, event: `telegram_identity_ops_${action}`, detail: { from_tail: tail(fromId) } }).then(() => null, () => null);
  return true;
}
