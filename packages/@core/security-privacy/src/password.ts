/**
 * Leaked-password protection (server only). Uses the Have I Been Pwned "Pwned Passwords" range API with
 * k-anonymity: SHA-1 the password locally, send ONLY the first 5 hex chars, compare suffixes locally.
 * The password and its full hash never leave the process and are never logged.
 * Standalone: no central dependency. Optional central event via ./feed when KIT_CENTRAL_REPORTING=on.
 */
import { sendSecurityEvent } from './feed';

// skipcq: JS-0067, JS-R1005 -- ES module scope (not a global); kept flat for auditability
export type PwnedResult = { status: 'ok' } | { status: 'pwned'; count: number } | { status: 'unavailable' };
// skipcq: JS-0067, JS-R1005 -- ES module scope (not a global); kept flat for auditability
export interface PwnedOptions {
  /** Default 2000 ms. */
  timeoutMs?: number;
  /** Injected fetch (tests / custom transport). */
  fetchImpl?: typeof fetch;
  /** Default https://api.pwnedpasswords.com/range/ */
  endpoint?: string;
  userAgent?: string;
}

// skipcq: JS-0067, JS-R1005 -- ES module scope (not a global); kept flat for auditability
export async function checkPwnedPassword(pw: string, opts: PwnedOptions = {}): Promise<PwnedResult> {
  // SHA-1 here is a lookup key mandated by the HIBP range API (k-anonymity), NOT password storage.
  const digest = await globalThis.crypto.subtle.digest('SHA-1', new TextEncoder().encode(pw));
  const hash = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  const prefix = hash.slice(0, 5), suffix = hash.slice(5);
  const doFetch = opts.fetchImpl ?? fetch;
  try {
    const res = await doFetch(`${opts.endpoint ?? 'https://api.pwnedpasswords.com/range/'}${prefix}`, {
      method: 'GET', cache: 'no-store',
      headers: { 'Add-Padding': 'true', 'User-Agent': opts.userAgent ?? 'core-security-privacy-kit' },
      signal: AbortSignal.timeout(opts.timeoutMs ?? 2000),
    });
    if (!res.ok) return { status: 'unavailable' };
    const body = await res.text();
    for (const line of body.split('\n')) {
      const [rowSuffix, rowCount] = line.trim().split(':');
      if (rowSuffix === suffix) {
        const count = Number.parseInt(rowCount ?? '0', 10);
        if (count > 0) return { status: 'pwned', count }; // padding rows have count 0
      }
    }
    return { status: 'ok' };
  } catch { return { status: 'unavailable' }; }
}

// skipcq: JS-0067, JS-R1005 -- ES module scope (not a global); kept flat for auditability
export interface PolicyOptions extends PwnedOptions {
  email?: string | null;
  /** Default 12. */
  minLength?: number;
  /** When HIBP is unreachable: false (default) = allow + log event; true = reject. Env PASSWORD_PWNED_FAIL_CLOSED=on also forces closed. */
  failClosed?: boolean;
  onEvent?: (kind: 'password_pwned_unavailable' | 'password_pwned_rejected') => void;
}
// skipcq: JS-0067, JS-R1005 -- ES module scope (not a global); kept flat for auditability
export type PolicyResult = { ok: true } | { ok: false; code: 'too_short' | 'equals_email' | 'pwned' | 'check_unavailable'; message: string };

// skipcq: JS-0067, JS-R1005 -- ES module scope (not a global); kept flat for auditability
export const PASSWORD_MESSAGES_HE = {
  too_short: (n: number) => `הסיסמה חייבת להכיל לפחות ${n} תווים.`,
  equals_email: 'הסיסמה לא יכולה להיות זהה לכתובת המייל.',
  pwned: 'הסיסמה הזו נמצאה במאגרי סיסמאות שדלפו ברשת. יש לבחור סיסמה אחרת.',
  check_unavailable: 'לא ניתן לבדוק את הסיסמה כרגע. נסו שוב בעוד רגע.',
} as const;

/** Full server-side policy: min length, not equal to email, not in a known breach. */
// skipcq: JS-0067, JS-R1005 -- ES module scope (not a global); kept flat for auditability
export async function checkPasswordPolicy(pw: string, opts: PolicyOptions = {}): Promise<PolicyResult> {
  const minLen = opts.minLength ?? 12;
  if (typeof pw !== 'string' || [...pw].length < minLen) return { ok: false, code: 'too_short', message: PASSWORD_MESSAGES_HE.too_short(minLen) };
  const email = opts.email?.trim().toLowerCase();
  if (email && (pw.trim().toLowerCase() === email || pw.trim().toLowerCase() === email.split('@')[0])) return { ok: false, code: 'equals_email', message: PASSWORD_MESSAGES_HE.equals_email };
  const lookup = await checkPwnedPassword(pw, opts);
  const emit = opts.onEvent ?? ((kind) => { sendSecurityEvent(kind, kind === 'password_pwned_unavailable' ? 'medium' : 'low').catch(() => undefined); });
  if (lookup.status === 'pwned') { emit('password_pwned_rejected'); return { ok: false, code: 'pwned', message: PASSWORD_MESSAGES_HE.pwned }; }
  if (lookup.status === 'unavailable') {
    emit('password_pwned_unavailable');
    // skipcq: JS-0002 -- security event log line (no password material)
    console.warn('[security-privacy] pwned-password check unavailable');
    if (opts.failClosed ?? process.env.PASSWORD_PWNED_FAIL_CLOSED === 'on') return { ok: false, code: 'check_unavailable', message: PASSWORD_MESSAGES_HE.check_unavailable };
  }
  return { ok: true };
}
