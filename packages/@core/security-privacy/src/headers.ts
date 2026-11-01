/** Strict security headers; nonce-based CSP, no unsafe-inline/eval. */
/** "overrides": per-product values; "null" removes a header (e.g. CSP set per request by middleware). */
// skipcq: JS-0067, JS-R1005 -- ES module scope (not a global); kept flat for auditability
export function securityHeaders(opts: { nonce?: string; api?: boolean; overrides?: Record<string, string | null> } = {}): Record<string, string> {
  const csp = opts.api
    ? "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"
    : ["default-src 'self'", `script-src 'self'${opts.nonce ? ` 'nonce-${opts.nonce}'` : ''} 'strict-dynamic'`, "style-src 'self'",
       "img-src 'self' data:", "font-src 'self'", "connect-src 'self'", "object-src 'none'", "base-uri 'none'",
       "form-action 'self'", "frame-ancestors 'none'", "upgrade-insecure-requests"].join('; ');
  const out: Record<string, string> = {
    'Content-Security-Policy': csp,
    'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'X-Frame-Options': 'DENY',
    'Cache-Control': opts.api ? 'no-store' : 'public, max-age=0, must-revalidate',
  };
  const merged: Record<string, string | null> = { ...out, ...opts.overrides };
  return Object.fromEntries(Object.entries(merged).filter((entry): entry is [string, string] => entry[1] !== null));
}

/** Next.js "headers()" shape. */
// skipcq: JS-0067, JS-R1005 -- ES module scope (not a global); kept flat for auditability
export const toNextHeaders = (h: Record<string, string>) => Object.entries(h).map(([key, value]) => ({ key, value }));
