import { headers } from 'next/headers';
import { LANDING_V2_HTML } from './landing-html';

// The landing page. On the public *.vercel.app host (and localhost) proxy.ts rewrites "/" here, so it is the
// home page; a direct visit to /landing-v2 on those hosts redirects to "/". On any other host "/" keeps the
// previous home page (app/page.tsx) and this URL stays an unindexed preview.
// The page is self-contained; its inline script receives the per-request CSP nonce set by proxy.ts.
export const dynamic = 'force-dynamic';

function isHomeHost(host: string): boolean {
  const h = host.toLowerCase().replace(/:\d+$/, '');
  return h.endsWith('.vercel.app') || h === 'localhost' || h === '127.0.0.1';
}

export async function GET(request: Request) {
  const h = await headers();
  const host = h.get('x-forwarded-host') || h.get('host') || '';
  const asHome = h.get('x-pathname') === '/';
  if (!asHome && isHomeHost(host)) {
    return Response.redirect(new URL('/', request.url), 308);
  }
  const nonce = h.get('x-nonce') ?? '';
  let html = nonce ? LANDING_V2_HTML.replace('<script>', `<script nonce="${nonce}">`) : LANDING_V2_HTML;
  if (asHome) html = html.replace('<meta name="robots" content="noindex, nofollow">', '<meta name="robots" content="index, follow">');
  const res = new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // per-request CSP nonce in the HTML: never cache a shared copy
      'Cache-Control': 'private, no-store',
    },
  });
  if (!asHome) res.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return res;
}
