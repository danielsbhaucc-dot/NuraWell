import { NextResponse } from 'next/server';
import { authorizeUrl, packSigninTx, pkceChallenge, randomToken, SIGNIN_COOKIE } from '@/lib/central/parent-connect';
import { buttonOn, signinMode } from '@/lib/central/parent-signin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * R20: start "sign in with the parent account". No NuraWell session needed.
 * ?probe=1 → { on } for the login button. Otherwise top-level GET → parent /authorize (state + PKCE + nonce).
 */
// skipcq: JS-0067 -- Next.js route handler export, not a global
export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = await signinMode();
  const on = buttonOn(mode, url.searchParams.get('pl'));
  if (url.searchParams.get('probe') === '1') return NextResponse.json({ on }, { headers: { 'cache-control': 'no-store' } });
  if (!on) return NextResponse.redirect(new URL('/login?e=parent_unavailable', request.url));
  const state = randomToken(32), verifier = randomToken(48), nonce = randomToken(24);
  const res = NextResponse.redirect(authorizeUrl(state, await pkceChallenge(verifier), nonce));
  res.cookies.set(SIGNIN_COOKIE, packSigninTx(state, verifier, nonce), { httpOnly: true, secure: true, sameSite: 'lax', path: '/api/v1/central', maxAge: 600 });
  res.headers.set('cache-control', 'no-store');
  return res;
}
