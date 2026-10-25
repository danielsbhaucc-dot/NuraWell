import { describe, expect, it } from 'vitest';
import { mergeAuthCookieOptions, SESSION_IDLE_MAX_AGE_S, SUPABASE_COOKIE_OPTIONS } from '@/lib/supabase/cookie-options';

describe('session cookie sliding 30-day idle window', () => {
  it('caps the 400-day @supabase/ssr default to 30 days', () => {
    const o = mergeAuthCookieOptions({ name: 'sb-x-auth-token', value: 'v', maxAge: 400 * 86400 });
    expect(o.maxAge).toBe(30 * 86400);
  });
  it('keeps shorter lifetimes and deletions untouched', () => {
    expect(mergeAuthCookieOptions({ name: 'a', value: '', maxAge: 0 }).maxAge).toBe(0);
    expect(mergeAuthCookieOptions({ name: 'a', value: 'v', maxAge: 3600 }).maxAge).toBe(3600);
  });
  it('browser client uses the same window', () => {
    expect(SUPABASE_COOKIE_OPTIONS.maxAge).toBe(SESSION_IDLE_MAX_AGE_S);
  });
});
