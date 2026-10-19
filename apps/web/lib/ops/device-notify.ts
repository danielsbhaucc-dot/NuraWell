/**
 * Delivery of Ops login approvals. Security messages: direct to the owner, bypass quiet/Shabbat
 * (sent as kind 'reply' — they are the immediate result of Daniel's own login attempt).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createTelegramChannel } from '@/lib/ceo/telegram';
import { allowedChatIds } from '@/lib/ceo/channel';
import { createStepupLink, hasPasskey } from '@/lib/ceo/security';
import { fmtIl } from '@/lib/ceo/quiet';
import { sendResendEmail } from '@/lib/email/resend';
import { emailCode, emailNotice, emailParagraph, emailSummaryTable, escapeHtml, renderEmailLayout } from '@/lib/email/layout';
import { publicAppBaseNoSlashSync } from '@/lib/public-app-url';
import { audit, createEmailChallenge, ONE_TAP_WINDOW_MS } from './device-trust';

export const GIDEON_EMAIL_FROM = process.env.RESEND_FROM_GIDEON?.trim() || 'גדעון · NuraWell <gideon@nurawell.ai>';

type Req = { id: string; user_id: string; label: string; location: string; created_at: string };

/** One-tap (no Face ID) only: no passkey registered yet AND within 24h of rollout. */
export async function oneTapAllowed(db: SupabaseClient, now = Date.now()): Promise<boolean> {
  if (await hasPasskey(db)) return false;
  const { data } = await db.from('ops_device_policy').select('enforce_from').maybeSingle();
  const from = Date.parse((data as { enforce_from?: string } | null)?.enforce_from ?? '');
  return Number.isFinite(from) && now - from >= 0 && now - from < ONE_TAP_WINDOW_MS;
}

export function loginCardText(r: Req): string {
  return `🔐 ניסיון כניסה ל-Ops ממכשיר חדש\n\n📱 ${r.label}\n📍 ${r.location} (משוער)\n🕒 ${fmtIl(new Date(r.created_at))}\n\nזה אתה? הבקשה תקפה 5 דקות.`;
}

export async function sendTelegramLoginCard(db: SupabaseClient, r: Req): Promise<boolean> {
  const chats = [...allowedChatIds()];
  if (!chats.length) return false;
  const ch = createTelegramChannel();
  const deny = { text: '🚫 זה לא אני', data: `ceo:ld:${r.id}` };
  let approve: { text: string; data: string; webApp?: string };
  if (await hasPasskey(db)) {
    approve = { text: '✅ אשר כניסה (Face ID)', data: '', webApp: await createStepupLink(db, 'ops_login', { payload: { requestId: r.id, label: r.label } }) };
  } else if (await oneTapAllowed(db)) {
    approve = { text: '✅ אשר כניסה', data: `ceo:la:${r.id}` };
  } else {
    // no Face ID and bootstrap window over → only deny here; approve via email / Ops / recovery code
    await ch.send(chats[0], `${loginCardText(r)}\n\nאישור: קוד מהמייל, מכשיר מאושר ב-Ops או קוד שחזור.`, [[deny]], { kind: 'reply' }).catch(() => {});
    return true;
  }
  await ch.send(chats[0], loginCardText(r), [[approve], [deny]], { kind: 'reply' }).catch(() => {});
  return true;
}

export async function sendLoginEmail(db: SupabaseClient, r: Req): Promise<boolean> {
  const { data } = await db.auth.admin.getUserById(r.user_id);
  const to = data.user?.email;
  if (!to) return false;
  const { code, token } = await createEmailChallenge(db, r.id);
  const origin = publicAppBaseNoSlashSync() || 'https://nurawell.vercel.app';
  const url = `${origin}/api/v1/ops/device/email?t=${encodeURIComponent(token)}`;
  const html = renderEmailLayout({
    preheader: `קוד כניסה ל-Ops: ${code}`,
    eyebrow: 'אבטחה',
    heading: 'אישור כניסה ממכשיר חדש',
    bodyHtml:
      emailParagraph('מישהו (כנראה אתה) התחבר ל-Ops ממכשיר שעוד לא מוכר. כדי להשלים את הכניסה, הקלד את הקוד במסך ההתחברות:', { center: true }) +
      emailCode(code) +
      emailSummaryTable([
        ['מכשיר', escapeHtml(r.label)],
        ['מיקום משוער', escapeHtml(r.location)],
        ['זמן', escapeHtml(fmtIl(new Date(r.created_at)))],
      ]),
    cta: { label: 'אשר כניסה', url },
    afterCtaHtml:
      emailParagraph('הכפתור עובד רק באותו דפדפן שבו התחברת. הקוד והכפתור תקפים 10 דקות ולשימוש אחד.', { muted: true, small: true, center: true }) +
      emailNotice('לא אתה? אל תעשה כלום ולחץ "זה לא אני" בטלגרם, או החלף סיסמה. הכניסה לא תאושר בלי הקוד.'),
    assetOrigin: publicAppBaseNoSlashSync() || 'https://nurawell.vercel.app',
  } as never);
  const res = await sendResendEmail({ to, from: GIDEON_EMAIL_FROM, subject: `קוד כניסה ל-Ops: ${code}`, html, text: `קוד כניסה ל-Ops: ${code}\nתקף 10 דקות.` });
  await audit(db, r.user_id, res.ok ? 'ops_login_email_sent' : 'ops_login_email_failed', { id: r.id, ...(res.ok ? {} : { error: res.error.slice(0, 120) }) });
  return res.ok;
}

/** Generic security alert to owner: Telegram + email, bypassing quiet hours. */
export async function alertOwnerSecurity(db: SupabaseClient, userId: string | null, text: string, subject: string): Promise<void> {
  const ch = createTelegramChannel();
  for (const id of allowedChatIds()) await ch.send(id, text, undefined, { kind: 'reply' }).catch(() => {});
  if (!userId) return;
  const { data } = await db.auth.admin.getUserById(userId);
  const to = data.user?.email;
  if (!to) return;
  await sendResendEmail({
    to, from: GIDEON_EMAIL_FROM, subject,
    html: renderEmailLayout({ preheader: subject, eyebrow: 'אבטחה', heading: subject, bodyHtml: emailParagraph(escapeHtml(text).replace(/\n/g, '<br>')), assetOrigin: publicAppBaseNoSlashSync() || 'https://nurawell.vercel.app' } as never),
    text,
  }).catch(() => undefined);
}
