import 'server-only';
import { NextResponse } from 'next/server';

export const NO_STORE = { 'Cache-Control': 'no-store, max-age=0', Pragma: 'no-cache' };
export const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });
export const clientIp = (req: Request) => (req.headers.get('x-real-ip') || req.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown').trim();
export function readCookie(request: Request, name: string): string | null {
  const raw = request.headers.get('cookie') ?? '';
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) {
      try {
        return decodeURIComponent(part.slice(i + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}
export async function readBody(req: Request, max = 16_000): Promise<Record<string, unknown> | null> {
  const t = await req.text().catch(() => '');
  if (!t || t.length > max) return null;
  try {
    const v = JSON.parse(t) as unknown;
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
export const sleepUntil = async (start: number, minMs: number) => {
  const left = minMs - (Date.now() - start);
  if (left > 0) await new Promise((r) => setTimeout(r, left));
};
