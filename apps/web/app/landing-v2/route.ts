import { headers } from 'next/headers';
import { LANDING_V2_HTML } from './landing-html';

// Preview of the new landing page. Not linked from navigation and not indexed.
// The page is self-contained; its single inline script receives the per-request
// CSP nonce set by proxy.ts, so the site-wide CSP stays unchanged.
export const dynamic = 'force-dynamic';

export async function GET() {
  const nonce = (await headers()).get('x-nonce') ?? '';
  const html = nonce
    ? LANDING_V2_HTML.replace('<script>', `<script nonce="${nonce}">`)
    : LANDING_V2_HTML;
  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Robots-Tag': 'noindex, nofollow',
      'Cache-Control': 'private, no-store',
    },
  });
}
