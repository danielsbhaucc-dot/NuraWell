import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isEnrollCommand } from '@platform/access';
import type { CeoChannel } from '@/lib/ceo/channel';
import { allowedChatIds } from '@/lib/ceo/channel';
import type { Update } from '@/lib/ceo/webhook';
import { opsCanonicalHostname } from '@/lib/ops-host';
import { audit, revokeDevice } from './device-trust';
import { revokeDeviceSessions } from './admin-session';
import { ownerAdminIds } from './device-notify';
import { decideMatch, issueEnrollmentLink } from './enrollment';

export const ENROLL_CB = /^ceo:em:([0-9a-f-]{36}):(\d{2})$/;
export const DEVICE_REVOKE_CB = /^ceo:dr:([0-9a-f-]{36})$/;

/** Telegram-only (taps must come from the owner's verified chat). Never email for number matching. */
export async function sendOwnerTelegram(channel: CeoChannel, text: string, buttons?: { text: string; data: string }[][]): Promise<number> {
  let n = 0;
  for (const id of allowedChatIds()) { try { await channel.send(id, text, buttons, { kind: 'reply' }); n++; } catch { /* next */ } }
  return n;
}

/**
 * Returns a result when the update was an enrollment command / callback, else null.
 * `strict` = authorizedSender against the env allowlist only (verified owner id, from.id === chat.id).
 * Unauthorized senders get no answer and no hint (same as any other blocked update).
 */
export async function handleEnrollUpdate(db: SupabaseClient, channel: CeoChannel, u: Update, strict: string | null): Promise<Record<string, unknown> | null> {
  const text = u.message?.text?.trim() ?? '';
  const cb = u.callback_query;
  const em = cb?.data?.match(ENROLL_CB);
  const dr = cb?.data?.match(DEVICE_REVOKE_CB);
  const isCmd = Boolean(u.message) && isEnrollCommand(text);
  if (!isCmd && !em && !dr) return null;
  if (!strict) return { ignored: true, enroll: 'unauthorized' };
  const ack = (msg: string) => cb ? channel.ack({ callbackId: cb.id, chatId: strict, messageId: cb.message?.message_id }, msg).catch(() => undefined) : Promise.resolve();

  if (isCmd) {
    const [owner] = await ownerAdminIds(db);
    if (!owner) return { enroll: 'no_owner' };
    const r = await issueEnrollmentLink(db, owner, `https://${opsCanonicalHostname()}`);
    if (!r.ok) { await channel.send(strict, 'יש כבר יותר מדי קישורים פתוחים. נסו שוב בעוד כמה דקות.', undefined, { kind: 'reply' }); return { enroll: 'too_many' }; }
    await channel.send(strict, `🔐 קישור חד-פעמי לרישום מכשיר חדש (תקף ל-10 דקות, פעם אחת בלבד):\n${r.url}\n\nאחרי פתיחה תתבקשו סיסמה + גורם חזק קיים, ואז אשלח לכאן מספר לאישור. אם לא ביקשתם — התעלמו.`, undefined, { kind: 'reply' });
    return { enroll: 'link' };
  }
  if (em) {
    const { result, row } = await decideMatch(db, em[1], Number(em[2]));
    if (result === 'approved') { await ack('✅ אושר. אפשר לסיים את הרישום במכשיר.'); return { enroll: 'approved' }; }
    if (result === 'wrong' && row) {
      await ack('⛔ מספר שגוי — הבקשה נדחתה והקישור בוטל.');
      await sendOwnerTelegram(channel, `🚨 ניסיון רישום מכשיר נדחה (מספר שגוי).\n${row.label || 'מכשיר'} · ${row.location || 'מיקום לא ידוע'}\nהקישור בוטל וכתובת ה-IP נחסמה זמנית. אם זה לא אתם — כדאי להחליף סיסמה.`);
      return { enroll: 'wrong' };
    }
    await ack(result === 'expired' ? '⌛ פג תוקף האישור. בקשו קישור חדש.' : 'הבקשה כבר טופלה או לא קיימת.');
    return { enroll: result };
  }
  if (dr) {
    const [owner] = await ownerAdminIds(db);
    const ok = owner ? await revokeDevice(db, owner, dr[1], 'telegram') : false;
    if (ok && owner) { await revokeDeviceSessions(db, dr[1]).catch(() => 0); await audit(db, owner, 'ops_device_revoked_tg', { device: dr[1] }); }
    await ack(ok ? '🗑️ המכשיר בוטל והחיבורים שלו נותקו.' : 'לא מצאתי מכשיר פעיל כזה.');
    return { enroll: 'revoke', ok };
  }
  return null;
}
