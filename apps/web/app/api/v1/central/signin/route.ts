import { NextResponse } from 'next/server';
import { authorizeUrl, packSigninTx, pkceChallenge, randomToken, SIGNIN_COOKIE, type AuthorizeMode } from '@/lib/central/parent-connect';
import { centralAuthOn, signinMode } from '@/lib/central/parent-signin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * R20: start parent-identity authentication for the product's own login or signup.
 * ?probe=1 → { on }. Otherwise top-level GET → parent /authorize (state + PKCE + nonce).
 * ?intent=signup marks a new registration; the callback continues into product onboarding when there is no account yet.
 */
// skipcq: JS-0067 -- Next.js route handler export, not a global
export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = await signinMode();
  const on = centralAuthOn(mode);
  if (url.searchParams.get('probe') === '1') return NextResponse.json({ on }, { headers: { 'cache-control': 'no-store' } });
  if (!on) return NextResponse.redirect(new URL('/login?e=parent_unavailable', request.url));
  const rawMode = url.searchParams.get('mode');
  const modeParam: AuthorizeMode | undefined = rawMode === 'passkey' || rawMode === 'qr' ? rawMode : undefined;
  if (rawMode && !modeParam) return NextResponse.redirect(new URL('/login?e=parent_unsupported', request.url));
  const intent = url.searchParams.get('intent') === 'signup' ? 'signup' : 'login';
  const state = randomToken(32), verifier = randomToken(48), nonce = randomToken(24);
  const res = NextResponse.redirect(authorizeUrl(state, await pkceChallenge(verifier), nonce, {
    mode: modeParam,
    screen: intent === 'signup' ? 'signup' : undefined,
  }));
  res.cookies.set(SIGNIN_COOKIE, packSigninTx(state, verifier, nonce, intent), { httpOnly: true, secure: true, sameSite: 'lax', path: '/api/v1/central', maxAge: 600 });
  res.headers.set('cache-control', 'no-store');
  return res;
}
