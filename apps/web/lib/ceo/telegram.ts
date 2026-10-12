import type { CeoButton, CeoChannel } from './channel';

const MAX = 4000; // Telegram limit is 4096 chars per message

function api(method: string, body: unknown, fetchImpl: typeof fetch = fetch) {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN missing');
  return fetchImpl(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
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
        await api('sendMessage', {
          chat_id: chatId,
          text: parts[i],
          disable_web_page_preview: true,
          ...(last && buttons?.length
            ? { reply_markup: { inline_keyboard: buttons.map((row) => row.map((b: CeoButton) => ({ text: b.text, callback_data: b.data }))) } }
            : {}),
        }, fetchImpl);
      }
    },
    async ack(ref, text) {
      if (ref.callbackId) await api('answerCallbackQuery', { callback_query_id: ref.callbackId }, fetchImpl);
      if (text && ref.messageId) {
        await api('editMessageText', { chat_id: ref.chatId, message_id: ref.messageId, text: text.slice(0, MAX), disable_web_page_preview: true }, fetchImpl);
      }
    },
  };
}
