import type { CookieOptions } from '@supabase/ssr';

/**
 * כאשר מגדירים NEXT_PUBLIC_AUTH_COOKIE_DOMAIN=.nurawell.ai
 * עוגיית ה־auth נשלחת לכל תתי־הדומיינים (למשל app + ops).
 */
export function mergeAuthCookieOptions<T extends CookieOptions>(input: T): T {
  // @supabase/ssr omits `Secure` by default: force it in production so the session never travels over HTTP.
  const partial = (process.env.NODE_ENV === 'production' ? { ...input, secure: true } : input) as T;
  const raw = process.env.NEXT_PUBLIC_AUTH_COOKIE_DOMAIN?.trim();
  if (!raw) return partial;
  const domain = raw.startsWith('.') ? raw : `.${raw}`;
  return { ...partial, domain } as T;
}

/** Browser-client defaults (httpOnly is impossible there; the nonce CSP is the XSS mitigation). */
export const SUPABASE_COOKIE_OPTIONS: CookieOptions = {
  path: '/',
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
};
