import type { CeoButton, CeoChannel } from './channel';
import { mdToPlain, mdToTelegramHtml } from './format';

const MAX = 3500; // Telegram limit is 4096; leave room for HTML escaping

async function api(method: string, body: unknown, fetchImpl: typeof fetch = fetch) {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN missing');
  const r = await fetchImpl(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  // never include the URL (it contains the token) in errors
  if (!r.ok) throw new Error(`telegram ${method} failed: ${r.status} ${(await r.text().catch(() => '')).slice(0, 200)}`);
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

export function createTelegramChannel(fetchImpl: typeof fetch = fetch): CeoChannel {
  return {
    name: 'telegram',
    async send(chatId, text, buttons) {
      const parts = splitMessage(text);
      for (let i = 0; i < parts.length; i++) {
        const last = i === parts.length - 1;
        const markup = last && buttons?.length
          ? { reply_markup: { inline_keyboard: buttons.map((row) => row.map((b: CeoButton) => ({ text: b.text, callback_data: b.data }))) } }
          : {};
        try {
          await api('sendMessage', { chat_id: chatId, text: mdToTelegramHtml(parts[i]), parse_mode: 'HTML', disable_web_page_preview: true, ...markup }, fetchImpl);
        } catch (e) {
          // HTML parse error (400) → resend as plain text
          if (!/failed: 400/.test(String(e))) throw e;
          await api('sendMessage', { chat_id: chatId, text: mdToPlain(parts[i]), disable_web_page_preview: true, ...markup }, fetchImpl);
        }
      }
    },
    async ack(ref, text) {
      if (ref.callbackId) await api('answerCallbackQuery', { callback_query_id: ref.callbackId }, fetchImpl);
      if (text && ref.messageId) {
        await api('editMessageText', { chat_id: ref.chatId, message_id: ref.messageId, text: mdToPlain(text).slice(0, MAX), disable_web_page_preview: true }, fetchImpl);
      }
    },
  };
}
