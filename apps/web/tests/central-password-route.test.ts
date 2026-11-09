import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Static contract of the first-party password route (the live flow is verified against production with a synthetic account).
describe('central password route', () => {
  const route = readFileSync('app/api/v1/central/password/route.ts', 'utf8');
  const login = readFileSync('app/(auth)/login/page.tsx', 'utf8');
  it('is same-origin, rate-limited, switch-gated and checks the bound nonce and issuer', () => {
    expect(route).toMatch(/sameOrigin\(request\)/);
    expect(route).toMatch(/namespace: 'central-password'/);
    expect(route.indexOf('centralAuthOn(mode)')).toBeLessThan(route.indexOf('parentClaims('));
    expect(route).toMatch(/boundNonceOk\(claims\.nonce, nonce\)/);
    expect(route).toMatch(/claims\?\.iss !== ISSUER/);
  });
  it('signs in only a matched account, records the grant before setting the parent cookie, and never logs credentials', () => {
    expect(route.indexOf('matchUser(')).toBeLessThan(route.indexOf('issueSessionForUser('));
    expect(route.indexOf("recorded !== 'recorded'")).toBeLessThan(route.indexOf('PARENT_SESSION_COOKIE, packed'));
    expect(route).not.toMatch(/console\.[a-z]+\('\[[^\]]+\]', \{[^}]*(password|email)/);
  });
  it('keeps the login screen unchanged and falls back to the native login only when the server says so', () => {
    expect(login).toMatch(/\/api\/v1\/central\/password/);
    expect(login).toMatch(/fallback === 'native'/);
    expect(login).toMatch(/signInWithPassword/);
  });
});
