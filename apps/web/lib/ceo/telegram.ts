import { stripOpsLinks, type CeoButton, type CeoChannel } from './channel';
import { mdToPlain, mdToTelegramHtml } from './format';
import { defaultGate, type OutboundGate } from './outbound';
import { logDelivery } from '@/lib/logging/delivery';

const tgButton = (b: CeoButton) =>
  b.webApp ? { text: b.text, web_app: { url: b.webApp } } : b.url ? { text: b.text, url: b.url } : { text: b.text, callback_data: b.data };

/** Telegram's built-in 🎉 message effect. */
export const EFFECT_CELEBRATE = '5046509860389126442';
const MAX = 3500; // Telegram limit is 4096; leave room for HTML escaping

/** Bot token: admin-set (encrypted in gideon_settings) → env TELEGRAM_BOT_TOKEN. */
export async function resolveBotToken(): Promise<string | null> {
  try {
    const { createAdminClient } = await import('@/lib/supabase/admin');
    const { gideonSecrets } = await import('./settings');
    return (await gideonSecrets(createAdminClient())).token;
  } catch {
    return process.env.TELEGRAM_BOT_TOKEN?.trim() || null;
  }
}

async function api(method: string, body: unknown, fetchImpl: typeof fetch = fetch, getToken: () => Promise<string | null> = resolveBotToken) {
  const token = (await getToken())?.trim();
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN missing');
  const r = await fetchImpl(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  // never include the URL (it contains the token) in errors
  const chat = (body as { chat_id?: unknown } | null)?.chat_id;
  const isSend = /^send/.test(method);
  if (!r.ok) {
    const err = new Error(`telegram ${method} failed: ${r.status} ${(await r.text().catch(() => '')).slice(0, 200)}`);
    if (isSend) await logDelivery({ channel: 'telegram', purpose: method, recipient: chat != null ? String(chat) : null, ok: false, error: err });
    throw err;
  }
  if (isSend) {
    const id = await r.clone().json().then((j: { result?: { message_id?: number } }) => j?.result?.message_id ?? null).catch(() => null);
    await logDelivery({ channel: 'telegram', purpose: method, recipient: chat != null ? String(chat) : null, ok: true, providerId: id != null ? String(id) : null });
  }
  return r;
}

export function splitMessage(text: string, max = MAX): string[] {
  const out: string[] = [];
  let rest = text.trim() || '…';
  while (rest.length > max) {
    let cut = rest.lastIndexOf('\n', max);
    if (cut < max / 2) cut = max;
    out.push(rest.slice(0, cut));
    rest = rest.slice(cut).trimStart();
  }
  out.push(rest);
  return out;
}

export function createTelegramChannel(fetchImpl: typeof fetch = fetch, getToken: () => Promise<string | null> = resolveBotToken, gate: OutboundGate = defaultGate): CeoChannel {
  return {
    name: 'telegram',
    async send(chatId, text, buttons, opts) {
      // The ONE enforcement point for Daniel's standing instructions (Shabbat, quiet hours, muted topics).
      const kind = opts?.kind ?? 'notice';
      if (kind !== 'reply' && kind !== 'outbox') {
        if ((await gate({ chatId, text, buttons, kind, topic: opts?.topic })) !== 'send') return;
      }
      // message effects work only in private chats (positive ids)
      const effect = opts?.effect === 'celebrate' && /^\d+$/.test(chatId) ? { message_effect_id: EFFECT_CELEBRATE } : {};
      const parts = splitMessage(stripOpsLinks(text));
      for (let i = 0; i < parts.length; i++) {
        const last = i === parts.length - 1;
        const markup = last && buttons?.length
          ? { reply_markup: { inline_keyboard: buttons.map((row) => row.map(tgButton)) } }
          : {};
        try {
          await api('sendMessage', { chat_id: chatId, text: mdToTelegramHtml(parts[i]), parse_mode: 'HTML', disable_web_page_preview: true, ...markup, ...(last ? effect : {}) }, fetchImpl, getToken);
        } catch (e) {
          // HTML parse error (400) → resend as plain text
          if (!/failed: 400/.test(String(e))) throw e;
          await api('sendMessage', { chat_id: chatId, text: mdToPlain(parts[i]), disable_web_page_preview: true, ...markup }, fetchImpl, getToken);
        }
      }
    },
    async ack(ref, text, buttons) {
      if (ref.callbackId) await api('answerCallbackQuery', { callback_query_id: ref.callbackId }, fetchImpl, getToken);
      if (text && ref.messageId) {
        const markup = buttons?.length ? { reply_markup: { inline_keyboard: buttons.map((row) => row.map(tgButton)) } } : {};
        await api('editMessageText', { chat_id: ref.chatId, message_id: ref.messageId, text: mdToPlain(stripOpsLinks(text)).slice(0, MAX), disable_web_page_preview: true, ...markup }, fetchImpl, getToken);
      }
    },
    async typing(chatId) {
      await api('sendChatAction', { chat_id: chatId, action: 'typing' }, fetchImpl, getToken).catch(() => {});
    },
    async react(chatId, messageId, emoji) {
      await api('setMessageReaction', { chat_id: chatId, message_id: messageId, reaction: [{ type: 'emoji', emoji }] }, fetchImpl, getToken).catch(() => {});
    },
  };
}
