import 'server-only';
import { checkPwnedPassword, PASSWORD_MESSAGES_HE } from '@core/security-privacy/password';
import { reportEvent } from '@/lib/monitoring/report-error';

/**
 * Server-side password policy (Supabase leaked-password protection needs Pro) — HIBP check comes from @core/security-privacy/password.
 * - Min length 12, not equal to the email, must contain at least one letter (any script) and one digit.
 * - HaveIBeenPwned Pwned Passwords range API with k-anonymity: only the first 5
 *   hex chars of the SHA-1 leave the server; `Add-Padding: true` hides the
 *   bucket size; responses are never cached.
 * - Fails OPEN on API error/timeout and logs a warn event WITHOUT any
 *   password/hash material.
 * The password / full hash is never logged, stored, or sent anywhere else.
 */

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;
export const HIBP_TIMEOUT_MS = 2000;
/** Uniform minimum duration so found / not-found responses take similar time. */
export const PASSWORD_CHECK_MIN_MS = 300;

export const PASSWORD_ERRORS = {
  tooShort: `הסיסמה קצרה מדי — לפחות ${PASSWORD_MIN_LENGTH} תווים`,
  tooLong: 'הסיסמה ארוכה מדי',
  equalsEmail: PASSWORD_MESSAGES_HE.equals_email,
  weak: 'הסיסמה צריכה לכלול גם אותיות וגם לפחות ספרה אחת',
  pwned:
    'הסיסמה הזאת הופיעה בדליפות מידע ברשת, ולכן קל לנחש אותה. בחרו בבקשה סיסמה אחרת.',
} as const;

export type PasswordCheckResult =
  | { ok: true; hibp: 'clean' | 'unavailable' }
  | { ok: false; reason: 'too_short' | 'too_long' | 'equals_email' | 'weak' | 'pwned'; error: string };

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Returns true (found), false (not found), or null (API unavailable). Delegates to the security-privacy kit (k-anonymity, padding, 2 s timeout). */
export async function isPwnedPassword(
  password: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean | null> {
  const r = await checkPwnedPassword(password, { fetchImpl, timeoutMs: HIBP_TIMEOUT_MS, userAgent: 'NuraWell-password-check' });
  return r.status === 'unavailable' ? null : r.status === 'pwned';
}

export async function checkPasswordPolicy(
  password: unknown,
  opts: { source: string; email?: string | null; fetchImpl?: typeof fetch } = { source: 'auth' },
): Promise<PasswordCheckResult> {
  const started = Date.now();
  let result: PasswordCheckResult;
  if (typeof password !== 'string' || password.length < PASSWORD_MIN_LENGTH) {
    result = { ok: false, reason: 'too_short', error: PASSWORD_ERRORS.tooShort };
  } else if (password.length > PASSWORD_MAX_LENGTH) {
    result = { ok: false, reason: 'too_long', error: PASSWORD_ERRORS.tooLong };
  } else if (opts.email && [opts.email.trim().toLowerCase(), opts.email.trim().toLowerCase().split('@')[0]].includes(password.trim().toLowerCase())) {
    result = { ok: false, reason: 'equals_email', error: PASSWORD_ERRORS.equalsEmail };
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
