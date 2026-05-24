import type { CookieOptions } from '@supabase/ssr';

/**
 * כאשר מגדירים NEXT_PUBLIC_AUTH_COOKIE_DOMAIN=.nurawell.ai
 * עוגיית ה־auth נשלחת לכל תתי־הדומיינים (למשל app + ops).
 */
export function mergeAuthCookieOptions<T extends CookieOptions>(partial: T): T {
  const raw = process.env.NEXT_PUBLIC_AUTH_COOKIE_DOMAIN?.trim();
  if (!raw) return partial;
  const domain = raw.startsWith('.') ? raw : `.${raw}`;
  return { ...partial, domain } as T;
}
