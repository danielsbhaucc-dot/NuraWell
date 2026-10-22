import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const proxy = readFileSync(join(__dirname, '..', 'proxy.ts'), 'utf8');
const route = readFileSync(join(__dirname, '..', 'app', 'landing-v2', 'route.ts'), 'utf8');

describe('home on *.vercel.app serves the landing page', () => {
  it('rewrites "/" to /landing-v2 only on *.vercel.app / localhost, after the signed-in redirects', () => {
    const i = proxy.indexOf("if (pathname === '/' && !effectiveOpsHost && (incomingHost.endsWith('.vercel.app') || isLocal))");
    expect(i).toBeGreaterThan(0);
    expect(proxy.indexOf('signedInRedirectTarget')).toBeLessThan(i);
  });
  it('redirects a direct /landing-v2 visit to "/" on home hosts and indexes only the home copy', () => {
    expect(route).toContain("Response.redirect(new URL('/', request.url), 308)");
    expect(route).toContain('<meta name="robots" content="index, follow">');
    expect(route).toContain("if (!asHome) res.headers.set('X-Robots-Tag', 'noindex, nofollow')");
  });
  it('keeps the previous home page in the repo for other hosts', () => {
    expect(readFileSync(join(__dirname, '..', 'app', 'page.tsx'), 'utf8')).toContain('LandingPageClient');
  });
});
