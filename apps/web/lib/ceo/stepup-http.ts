import { NextResponse } from 'next/server';
import { consumeRateLimit } from '@/lib/api/rate-limit';
import { createTelegramChannel, resolveBotToken } from './telegram';
export { resolveBotToken };
import { allowedChatIds } from './channel';

export function clientIp(req: Request): string {
  return (req.headers.get('x-real-ip') || req.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown').trim();
}
export async function limitIp(req: Request, ns: string, limit = 20): Promise<NextResponse | null> {
  const r = await consumeRateLimit({ key: clientIp(req), namespace: ns, limit, windowSeconds: 600 });
  return r.ok ? null : NextResponse.json({ error: 'יותר מדי ניסיונות. נסה שוב בעוד כמה דקות.' }, { status: 429 });
}
/** Owner alert. 'security' (default) passes the quiet-time gate; 'reply' = result of Daniel's own action. */
export async function alertOwner(text: string, kind: 'security' | 'reply' = 'security') {
  const ch = createTelegramChannel();
  for (const id of allowedChatIds()) await ch.send(id, text, undefined, { kind }).catch(() => {});
}
export const noStore = { headers: { 'Cache-Control': 'no-store' } };

/** Send a one-time Mini App button (Face ID inside Telegram) to the verified chat. Never a plain link. */
export async function sendMiniAppButton(chatId: string, text: string, url: string, buttonText = '🔐 Face ID') {
  // only ever sent right after Daniel acted (Ops approval / Face ID request) → a reply, never held
  await createTelegramChannel().send(chatId, text, [[{ text: buttonText, data: '', webApp: url }]], { kind: 'reply' });
}
