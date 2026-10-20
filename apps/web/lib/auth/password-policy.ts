import 'server-only';
import { createHash } from 'node:crypto';
import { reportEvent } from '@/lib/monitoring/report-error';

/**
 * Server-side password policy (Supabase leaked-password protection needs Pro).
 * - Min length 10, must contain at least one letter (any script) and one digit.
 * - HaveIBeenPwned Pwned Passwords range API with k-anonymity: only the first 5
 *   hex chars of the SHA-1 leave the server; `Add-Padding: true` hides the
 *   bucket size; responses are never cached.
 * - Fails OPEN on API error/timeout and logs a warn event WITHOUT any
 *   password/hash material.
 * The password / full hash is never logged, stored, or sent anywhere else.
 */

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;
export const HIBP_TIMEOUT_MS = 2000;
/** Uniform minimum duration so found / not-found responses take similar time. */
export const PASSWORD_CHECK_MIN_MS = 300;

export const PASSWORD_ERRORS = {
  tooShort: `הסיסמה קצרה מדי — לפחות ${PASSWORD_MIN_LENGTH} תווים`,
  tooLong: 'הסיסמה ארוכה מדי',
  weak: 'הסיסמה צריכה לכלול גם אותיות וגם לפחות ספרה אחת',
  pwned:
    'הסיסמה הזאת הופיעה בדליפות מידע ברשת, ולכן קל לנחש אותה. בחרו בבקשה סיסמה אחרת.',
} as const;

export type PasswordCheckResult =
  | { ok: true; hibp: 'clean' | 'unavailable' }
  | { ok: false; reason: 'too_short' | 'too_long' | 'weak' | 'pwned'; error: string };

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Returns true (found), false (not found), or null (API unavailable). */
export async function isPwnedPassword(
  password: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean | null> {
  const sha1 = createHash('sha1').update(password, 'utf8').digest('hex').toUpperCase();
  const prefix = sha1.slice(0, 5);
  const suffix = sha1.slice(5);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), HIBP_TIMEOUT_MS);
  try {
    const res = await fetchImpl(`https://api.pwnedpasswords.com/range/${prefix}`, {
      method: 'GET',
      headers: { 'Add-Padding': 'true', 'User-Agent': 'NuraWell-password-check' },
      cache: 'no-store',
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const body = await res.text();
    // Scan every line (no early exit) to keep timing independent of the result.
    let found = false;
    for (const line of body.split('\n')) {
      const idx = line.indexOf(':');
      if (idx < 0) continue;
      const count = Number.parseInt(line.slice(idx + 1).trim(), 10);
      // padding entries have count 0
      if (line.slice(0, idx).trim().toUpperCase() === suffix && count > 0) found = true;
    }
    return found;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function checkPasswordPolicy(
  password: unknown,
  opts: { source: string; fetchImpl?: typeof fetch } = { source: 'auth' },
): Promise<PasswordCheckResult> {
  const started = Date.now();
  let result: PasswordCheckResult;
  if (typeof password !== 'string' || password.length < PASSWORD_MIN_LENGTH) {
    result = { ok: false, reason: 'too_short', error: PASSWORD_ERRORS.tooShort };
  } else if (password.length > PASSWORD_MAX_LENGTH) {
    result = { ok: false, reason: 'too_long', error: PASSWORD_ERRORS.tooLong };
  } else if (!/\p{L}/u.test(password) || !/\p{Nd}/u.test(password)) {
    result = { ok: false, reason: 'weak', error: PASSWORD_ERRORS.weak };
  } else {
    const pwned = await isPwnedPassword(password, opts.fetchImpl);
    if (pwned === null) {
      // eslint-disable-next-line no-console
      console.warn(`[password-policy] hibp_unavailable_fail_open source=${opts.source}`);
      void reportEvent('hibp_unavailable_fail_open', { source: opts.source }, 'warning').catch(
        () => undefined,
      );
      result = { ok: true, hibp: 'unavailable' };
    } else if (pwned) {
      result = { ok: false, reason: 'pwned', error: PASSWORD_ERRORS.pwned };
    } else {
      result = { ok: true, hibp: 'clean' };
    }
  }
  const elapsed = Date.now() - started;
  if (elapsed < PASSWORD_CHECK_MIN_MS) await sleep(PASSWORD_CHECK_MIN_MS - elapsed);
  return result;
}
