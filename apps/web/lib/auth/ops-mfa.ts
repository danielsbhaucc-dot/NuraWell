import { createHmac, hkdfSync, timingSafeEqual } from 'node:crypto';

/**
 * Ops second factor: after a passkey (Face ID) check the server sets a signed, httpOnly cookie bound to the
 * admin's user id. Idle timeout 30 min (sliding), absolute 12 h. Stateless HMAC; key from OPS_SESSION_SIGNING_KEY or
 * HKDF(SUPABASE_SERVICE_ROLE_KEY). Logging out of Supabase / another user → uid mismatch → invalid.
 */
export const OPS_MFA_COOKIE = 'nw_ops_mfa';
export const OPS_IDLE_MS = 30 * 60_000;
export const OPS_ABSOLUTE_MS = 12 * 60 * 60_000;

type Payload = { u: string; iat: number; seen: number };

function key(): Buffer {
  const signingKey = process.env.OPS_SESSION_SIGNING_KEY?.trim();
  if (signingKey && signingKey.length >= 32) return Buffer.from(hkdfSync('sha256', signingKey, 'nurawell-ops-mfa', 'v1', 32));
  const base = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!base) throw new Error('no OPS_MFA key');
  return Buffer.from(hkdfSync('sha256', base, 'nurawell-ops-mfa', 'v1', 32));
}
const sig = (data: string) => createHmac('sha256', key()).update(data).digest('base64url');

export function signOpsMfa(userId: string, now = Date.now(), iat = now): string {
  const data = Buffer.from(JSON.stringify({ u: userId, iat, seen: now } satisfies Payload)).toString('base64url');
  return `${data}.${sig(data)}`;
}

/** Returns the payload when valid for this user and not idle/expired. */
export function verifyOpsMfa(value: string | undefined | null, userId: string, now = Date.now()): Payload | null {
  if (!value) return null;
  const [data, s] = value.split('.');
  if (!data || !s) return null;
  try {
    const a = Buffer.from(sig(data));
    const b = Buffer.from(s);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const p = JSON.parse(Buffer.from(data, 'base64url').toString('utf8')) as Payload;
    if (p.u !== userId) return null;
    if (now - p.iat > OPS_ABSOLUTE_MS || now - p.seen > OPS_IDLE_MS) return null;
    return p;
  } catch {
    return null;
  }
}

export const opsMfaCookieOptions = { httpOnly: true, secure: true, sameSite: 'strict' as const, path: '/', maxAge: OPS_ABSOLUTE_MS / 1000 };

export function readCookie(header: string | null, name: string): string | null {
  for (const part of (header ?? '').split(/;\s*/)) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i) === name) return decodeURIComponent(part.slice(i + 1));
  }
  return null;
}
