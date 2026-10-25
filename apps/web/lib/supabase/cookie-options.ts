import type { CookieOptions } from '@supabase/ssr';

/**
 * כאשר מגדירים NEXT_PUBLIC_AUTH_COOKIE_DOMAIN=.nurawell.ai
 * עוגיית ה־auth נשלחת לכל תתי־הדומיינים (למשל app + ops).
 */
/**
 * Sliding inactivity window for the session cookie (was @supabase/ssr's 400-day default).
 * Every token refresh (≈hourly while the app is in use) re-sets the cookie with a fresh 30 days,
 * so an active user stays signed in and a device unused for 30 days is signed out.
 */
export const SESSION_IDLE_MAX_AGE_S = 60 * 60 * 24 * 30;

export function mergeAuthCookieOptions<T extends CookieOptions>(input: T): T {
  // @supabase/ssr omits `Secure` by default: force it in production so the session never travels over HTTP.
  let partial = (process.env.NODE_ENV === 'production' ? { ...input, secure: true } : input) as T;
  if (typeof partial.maxAge === 'number' && partial.maxAge > SESSION_IDLE_MAX_AGE_S) {
    partial = { ...partial, maxAge: SESSION_IDLE_MAX_AGE_S } as T;
  }
  const raw = process.env.NEXT_PUBLIC_AUTH_COOKIE_DOMAIN?.trim();
  if (!raw) return partial;
  const domain = raw.startsWith('.') ? raw : `.${raw}`;
  return { ...partial, domain } as T;
}

/** Browser-client defaults (httpOnly is impossible there; the nonce CSP is the XSS mitigation). */
export const SUPABASE_COOKIE_OPTIONS: CookieOptions = {
  path: '/',
  sameSite: 'lax',
  maxAge: SESSION_IDLE_MAX_AGE_S,
  secure: process.env.NODE_ENV === 'production',
};
