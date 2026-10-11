/**
 * עוגיית סשן דמו חתומה (HMAC) — תואמת Edge Runtime.
 * payload: linkId.userId.expMs.sessionEpoch
 */

export const DEMO_ACCESS_COOKIE = 'nw_demo';

function cookieSecret(): string | null {
  const s =
    process.env.DEMO_ACCESS_COOKIE_SECRET?.trim() ||
    process.env.CHALLENGE_GATE_COOKIE_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    '';
  return s.length >= 16 ? s : null;
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function hmac(secret: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(`demo-access:v1:${secret}`),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return toHex(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export type DemoAccessCookiePayload = {
  linkId: string;
  userId: string;
  expMs: number;
  sessionEpoch: number;
  guestName: string | null;
  reason: string;
};

export async function signDemoAccessCookie(
  payload: Omit<DemoAccessCookiePayload, 'guestName' | 'reason'> & {
    guestName?: string | null;
    reason?: string;
  },
): Promise<string | null> {
  const secret = cookieSecret();
  if (!secret) return null;
  const guest = (payload.guestName ?? '').replace(/[.|]/g, ' ').slice(0, 80);
  const reason = (payload.reason ?? '').replace(/[.|]/g, ' ').slice(0, 280);
  const body = `${payload.linkId}.${payload.userId}.${payload.expMs}.${payload.sessionEpoch}.${guest}.${reason}`;
  const sig = await hmac(secret, body);
  return `${body}.${sig}`;
}

export async function parseDemoAccessCookie(
  value: string | undefined,
  nowMs = Date.now(),
): Promise<DemoAccessCookiePayload | null> {
  if (!value) return null;
  const secret = cookieSecret();
  if (!secret) return null;

  const parts = value.split('.');
  if (parts.length < 7) return null;
  const sig = parts[parts.length - 1]!;
  const linkId = parts[0]!;
  const userId = parts[1]!;
  const expRaw = parts[2]!;
  const epochRaw = parts[3]!;
  const guestName = parts[4] || null;
  // reason may contain dots if we used join wrongly — we joined with fixed fields so
  // reason is parts[5..-2] joined? Actually we used `.` as separator and stripped dots from reason.
  // Format: linkId.userId.exp.epoch.guest.reason.sig → 7 parts when reason has no dots.
  const reason = parts.slice(5, -1).join('.') || '';
  const body = `${linkId}.${userId}.${expRaw}.${epochRaw}.${guestName ?? ''}.${reason}`;
  const expected = await hmac(secret, body);
  if (!timingSafeEqual(sig, expected)) return null;

  const expMs = Number(expRaw);
  const sessionEpoch = Number(epochRaw);
  if (!Number.isFinite(expMs) || !Number.isFinite(sessionEpoch) || sessionEpoch < 1) return null;
  if (expMs <= nowMs) return null;
  if (!/^[0-9a-f-]{36}$/i.test(linkId) || !/^[0-9a-f-]{36}$/i.test(userId)) return null;

  return {
    linkId,
    userId,
    expMs,
    sessionEpoch,
    guestName: guestName?.trim() ? guestName.trim() : null,
    reason: reason.trim(),
  };
}

export function demoAccessCookieOptions(maxAgeSec: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: Math.max(60, maxAgeSec),
  };
}
