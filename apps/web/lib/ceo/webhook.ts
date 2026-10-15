import { withAiUsage } from '@/lib/ai/usage-meter';
import type { SupabaseClient } from '@supabase/supabase-js';
import { timingSafeEqualStr } from '@/lib/api/timing-safe-equal';
import { consumeRateLimit } from '@/lib/api/rate-limit';
import { decideAction, setActionTarget } from './actions';
import { runCeoTurn } from './agent';
import type { CeoChannel } from './channel';
import { allowedChatIds } from './channel';
import { setOwnerTask } from './owner-tasks';
import { invalidateTrust, killSwitch, requestDevice, securityState } from './security';
import { detectDeviceChange } from './intents';

type Update = {
  message?: { chat: { id: number }; text?: string; message_id?: number };
  callback_query?: { id: string; data?: string; message?: { chat: { id: number }; message_id: number } };
};

/** Secret-token header check (set via setWebhook secret_token). Fails closed when env is missing. */
export function verifyTelegramSecret(header: string | null, secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim()): boolean {
  return Boolean(secret && header && timingSafeEqualStr(header, secret));
}

export async function handleTelegramUpdate(...a: Parameters<typeof handleTelegramUpdateInner>) {
  return withAiUsage({ feature: 'gideon_chat' }, () => handleTelegramUpdateInner(...a));
}

async function handleTelegramUpdateInner(db: SupabaseClient, channel: CeoChannel, u: Update, deps: { runTurn?: typeof runCeoTurn } = {}) {
  const chatId = String(u.message?.chat.id ?? u.callback_query?.message?.chat.id ?? '');
  if (!chatId) return { ignored: true };
  if (!allowedChatIds().has(chatId)) {
    // silent for strangers, but tell Daniel (once a day per chat) and drop the passkey trust window
    const once = await consumeRateLimit({ key: chatId, namespace: 'ceo-stranger', limit: 1, windowSeconds: 86_400 });
    if (once.ok) {
      await invalidateTrust(db, 'unknown chat').catch(() => {});
      for (const id of allowedChatIds()) {
        await channel.send(id, `⚠️ צ'אט לא מוכר ניסה לדבר עם גדעון (מסתיים ב-${chatId.slice(-4)}). לא קיבל תשובה. אם זה לא אתה, אפשר לכבות את גדעון מ-Ops.`).catch(() => {});
      }
    }
    return { ignored: true };
  }

  const sec = await securityState(db);
  const rawText = u.message?.text?.trim() ?? '';
  if (/^\/(lock|kill)$|^(כבה|תכבה) את עצמך$/.test(rawText)) {
    await killSwitch(db, `admin:${chatId}`, 'telegram command');
    await channel.send(chatId, '⛔ גדעון כבוי. כל הפעולות הממתינות בוטלו. הפעלה מחדש: Ops ← גדעון ← אבטחה (דורש Face ID).');
    return { killed: true };
  }
  if (detectDeviceChange(rawText)) {
    const replace = /(החלפתי|חדש|נגנב|איבדתי|אבד)/.test(rawText);
    const { existing } = await requestDevice(db, chatId, replace);
    await channel.send(chatId, existing ? 'כבר יש בקשה פתוחה. אשר אותה בלוח הבקרה ונתקדם.' : 'שלחתי לך התראה בלוח הבקרה, תאשר אותה ונתקדם 👍');
    return { deviceRequest: true };
  }
  if (sec.disabled) {
    if (u.callback_query) await channel.ack({ callbackId: u.callback_query.id, chatId });
    else await channel.send(chatId, '⛔ גדעון כבוי כרגע. אפשר להפעיל מחדש מ-Ops ← גדעון ← אבטחה.');
    return { disabled: true };
  }

  const rl = await consumeRateLimit({ key: chatId, namespace: 'ceo-min', limit: 20, windowSeconds: 60 });
  const rlDay = await consumeRateLimit({ key: chatId, namespace: 'ceo-day', limit: 300, windowSeconds: 86_400 });
  if (!rl.ok || !rlDay.ok) {
    await channel.send(chatId, 'יותר מדי בקשות, נסה שוב עוד רגע.');
    return { limited: true };
  }

  const cb = u.callback_query;
  if (cb?.data?.startsWith('ceo:')) {
    const [, kind, id] = cb.data.split(':');
    if (kind === 'td' || kind === 'ts' || kind === 'tw') {
      const t = await setOwnerTask(db, id, kind === 'td' ? { status: 'done' } : { snoozeDays: kind === 'ts' ? 1 : 7 });
      const msg = !t ? 'המשימה לא נמצאה.' : kind === 'td' ? `✅ סגרתי: ${t.title}` : `⏰ נדחה ל${kind === 'ts' ? 'מחר' : 'שבוע'}: ${t.title}`;
      await channel.ack({ callbackId: cb.id, chatId, messageId: cb.message?.message_id }, msg);
      return { task: kind };
    }
    if (kind === 't') {
      const card = await setActionTarget(db, id, cb.data.split(':')[3] ?? '');
      await channel.ack({ callbackId: cb.id, chatId, messageId: cb.message?.message_id }, card?.text ?? 'הפעולה כבר טופלה או שפג תוקפה.', card?.buttons);
      return { target: Boolean(card) };
    }
    const r = await decideAction(db, id, kind === 'a', `admin:${chatId}`, { edit: kind === 'e' });
    if (r.stepupUrl) {
      await channel.ack({ callbackId: cb.id, chatId, messageId: cb.message?.message_id }, r.text, [
        [{ text: '🔐 אשר עם Face ID', data: '', webApp: r.stepupUrl }],
        [{ text: '❌ דחה', data: `ceo:r:${id}` }],
      ]);
      return { stepup: true };
    }
    if (r.celebrate) {
      // the link gets its own message with a 🎉 effect; the card just flips to "approved"
      await channel.ack({ callbackId: cb.id, chatId, messageId: cb.message?.message_id }, '✅ אושר');
      await channel.send(chatId, r.text, undefined, { effect: 'celebrate' });
    } else {
      await channel.ack({ callbackId: cb.id, chatId, messageId: cb.message?.message_id }, r.text);
    }
    return { decided: r.ok };
  }

  const text = u.message?.text?.trim();
  if (!text) return { ignored: true };
  if (text === '/start') {
    await channel.send(chatId, 'שלום דניאל, אני כאן. אפשר לשאול אותי כל דבר על המערכת.');
    return { ok: true };
  }
  const msgId = u.message?.message_id;
  if (msgId) await channel.react?.(chatId, msgId, '👀');
  await channel.typing?.(chatId);
  const r = await (deps.runTurn ?? runCeoTurn)(db, `${channel.name}:${chatId}`, text.slice(0, 4000));
  await channel.send(chatId, r.text, r.buttons);
  for (const c of r.cards ?? []) await channel.send(chatId, c.text, c.buttons);
  return { ok: true };
}
