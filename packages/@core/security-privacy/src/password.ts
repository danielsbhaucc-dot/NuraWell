/**
 * Leaked-password protection (server only). Uses the Have I Been Pwned "Pwned Passwords" range API with
 * k-anonymity: SHA-1 the password locally, send ONLY the first 5 hex chars, compare suffixes locally.
 * The password and its full hash never leave the process and are never logged.
 * Standalone: no central dependency. Optional central event via ./feed when KIT_CENTRAL_REPORTING=on.
 */
import { createHash } from 'node:crypto';
import { sendSecurityEvent } from './feed';

export type PwnedResult = { status: 'ok' } | { status: 'pwned'; count: number } | { status: 'unavailable' };
export interface PwnedOptions {
  /** Default 2000 ms. */
  timeoutMs?: number;
  /** Injected fetch (tests / custom transport). */
  fetchImpl?: typeof fetch;
  /** Default https://api.pwnedpasswords.com/range/ */
  endpoint?: string;
  userAgent?: string;
}

// skipcq: JS-0067 -- ES module scope
export async function checkPwnedPassword(pw: string, opts: PwnedOptions = {}): Promise<PwnedResult> {
  const hash = createHash('sha1').update(pw, 'utf8').digest('hex').toUpperCase();
  const prefix = hash.slice(0, 5), suffix = hash.slice(5);
  const f = opts.fetchImpl ?? fetch;
  try {
    const res = await f(`${opts.endpoint ?? 'https://api.pwnedpasswords.com/range/'}${prefix}`, {
      method: 'GET', cache: 'no-store',
      headers: { 'Add-Padding': 'true', 'User-Agent': opts.userAgent ?? 'core-security-privacy-kit' },
      signal: AbortSignal.timeout(opts.timeoutMs ?? 2000),
    });
    if (!res.ok) return { status: 'unavailable' };
    const body = await res.text();
    for (const line of body.split('\n')) {
      const [s, c] = line.trim().split(':');
      if (s === suffix) {
        const count = Number.parseInt(c ?? '0', 10);
        if (count > 0) return { status: 'pwned', count }; // padding rows have count 0
      }
    }
    return { status: 'ok' };
  } catch { return { status: 'unavailable' }; }
}

export interface PolicyOptions extends PwnedOptions {
  email?: string | null;
  /** Default 12. */
  minLength?: number;
  /** When HIBP is unreachable: false (default) = allow + log event; true = reject. Env PASSWORD_PWNED_FAIL_CLOSED=on also forces closed. */
  failClosed?: boolean;
  onEvent?: (kind: 'password_pwned_unavailable' | 'password_pwned_rejected') => void;
}
export type PolicyResult = { ok: true } | { ok: false; code: 'too_short' | 'equals_email' | 'pwned' | 'check_unavailable'; message: string };

export const PASSWORD_MESSAGES_HE = {
  too_short: (n: number) => `הסיסמה חייבת להכיל לפחות ${n} תווים.`,
  equals_email: 'הסיסמה לא יכולה להיות זהה לכתובת המייל.',
  pwned: 'הסיסמה הזו נמצאה במאגרי סיסמאות שדלפו ברשת. יש לבחור סיסמה אחרת.',
  check_unavailable: 'לא ניתן לבדוק את הסיסמה כרגע. נסו שוב בעוד רגע.',
} as const;

/** Full server-side policy: min length, not equal to email, not in a known breach. */
// skipcq: JS-0067 -- ES module scope
export async function checkPasswordPolicy(pw: string, opts: PolicyOptions = {}): Promise<PolicyResult> {
  const min = opts.minLength ?? 12;
  if (typeof pw !== 'string' || [...pw].length < min) return { ok: false, code: 'too_short', message: PASSWORD_MESSAGES_HE.too_short(min) };
  const email = opts.email?.trim().toLowerCase();
  if (email && (pw.trim().toLowerCase() === email || pw.trim().toLowerCase() === email.split('@')[0])) return { ok: false, code: 'equals_email', message: PASSWORD_MESSAGES_HE.equals_email };
  const r = await checkPwnedPassword(pw, opts);
  const emit = opts.onEvent ?? ((k) => { void sendSecurityEvent(k, k === 'password_pwned_unavailable' ? 'medium' : 'low'); });
  if (r.status === 'pwned') { emit('password_pwned_rejected'); return { ok: false, code: 'pwned', message: PASSWORD_MESSAGES_HE.pwned }; }
  if (r.status === 'unavailable') {
    emit('password_pwned_unavailable');
    console.warn('[security-privacy] pwned-password check unavailable');
    if (opts.failClosed ?? process.env.PASSWORD_PWNED_FAIL_CLOSED === 'on') return { ok: false, code: 'check_unavailable', message: PASSWORD_MESSAGES_HE.check_unavailable };
  }
  return { ok: true };
}
