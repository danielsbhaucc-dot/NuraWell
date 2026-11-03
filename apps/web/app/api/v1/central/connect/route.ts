import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { authorizeUrl, packTx, pkceChallenge, randomToken, TX_COOKIE } from '@/lib/central/parent-connect';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Start connecting a parent-site purchase to the signed-in NuraWell account (top-level GET from the purchase page). */
// skipcq: JS-0067 -- Next.js route handler export, not a global
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL('/login?redirect=/api/v1/central/connect', request.url));
  const state = randomToken(32), verifier = randomToken(48);
  const res = NextResponse.redirect(authorizeUrl(state, await pkceChallenge(verifier)));
  res.cookies.set(TX_COOKIE, packTx(state, verifier), { httpOnly: true, secure: true, sameSite: 'lax', path: '/api/v1/central', maxAge: 600 });
  res.headers.set('cache-control', 'no-store');
  return res;
}
