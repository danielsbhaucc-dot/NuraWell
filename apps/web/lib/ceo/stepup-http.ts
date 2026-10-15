import { NextResponse } from 'next/server';
import { consumeRateLimit } from '@/lib/api/rate-limit';
import { createTelegramChannel } from './telegram';
import { allowedChatIds } from './channel';

export function clientIp(req: Request): string {
  return (req.headers.get('x-real-ip') || req.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown').trim();
}
export async function limitIp(req: Request, ns: string, limit = 20): Promise<NextResponse | null> {
  const r = await consumeRateLimit({ key: clientIp(req), namespace: ns, limit, windowSeconds: 600 });
  return r.ok ? null : NextResponse.json({ error: 'יותר מדי ניסיונות. נסה שוב בעוד כמה דקות.' }, { status: 429 });
}
export async function alertOwner(text: string) {
  const ch = createTelegramChannel();
  for (const id of allowedChatIds()) await ch.send(id, text).catch(() => {});
}
export const noStore = { headers: { 'Cache-Control': 'no-store' } };
