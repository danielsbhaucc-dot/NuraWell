/** Strict security headers; nonce-based CSP, no unsafe-inline/eval. */
/** `overrides`: per-product values; `null` removes a header (e.g. CSP set per request by middleware). */
export function securityHeaders(o: { nonce?: string; api?: boolean; overrides?: Record<string, string | null> } = {}): Record<string, string> {
  const csp = o.api
    ? "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"
    : [`default-src 'self'`, `script-src 'self'${o.nonce ? ` 'nonce-${o.nonce}'` : ''} 'strict-dynamic'`, `style-src 'self'`,
       `img-src 'self' data:`, `font-src 'self'`, `connect-src 'self'`, `object-src 'none'`, `base-uri 'none'`,
       `form-action 'self'`, `frame-ancestors 'none'`, `upgrade-insecure-requests`].join('; ');
  const h: Record<string, string> = {
    'Content-Security-Policy': csp,
    'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'X-Frame-Options': 'DENY',
    'Cache-Control': o.api ? 'no-store' : 'public, max-age=0, must-revalidate',
  };
  for (const [k, v] of Object.entries(o.overrides ?? {})) { if (v === null) delete h[k]; else h[k] = v; }
  return h;
}

/** Next.js `headers()` shape. */
export const toNextHeaders = (h: Record<string, string>) => Object.entries(h).map(([key, value]) => ({ key, value }));
