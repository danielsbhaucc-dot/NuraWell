import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { timingSafeEqualStr } from '@/lib/api/timing-safe-equal';
import { CLIENT_ID, ISSUER, REDIRECT_URI, TX_COOKIE, unpackTx, verifyAccessToken, type Claims } from '@/lib/central/parent-connect';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 20;

type Tx = { state: string; verifier: string };

const finish = (request: NextRequest, path: string) => {
  const res = NextResponse.redirect(new URL(path, request.url));
  res.cookies.set(TX_COOKIE, '', { httpOnly: true, secure: true, sameSite: 'lax', path: '/api/v1/central', maxAge: 0 });
  res.headers.set('cache-control', 'no-store');
  return res;
};

/** Validate the redirect: returns the transaction and code, or a failure reason. */
const readRedirect = (request: NextRequest): { tx: Tx; code: string } | { why: string } => {
  const tx = unpackTx(request.cookies.get(TX_COOKIE)?.value);
  const params = request.nextUrl.searchParams;
  const code = params.get('code') ?? '';
  const state = params.get('state') ?? '';
  if (!tx || !state || !timingSafeEqualStr(state, tx.state)) return { why: 'state' };
  const err = params.get('error');
  if (err) return { why: err };
  if (!/^[A-Za-z0-9_-]{16,100}$/.test(code)) return { why: 'code' };
  return { tx, code };
};

/** Exchange the code and verify the access token. Returns the claims or a failure reason. */
const exchange = async (central: string, secret: string, tx: Tx, code: string): Promise<Claims | string> => {
  const tokenRes = await fetch(`${central}/functions/v1/identity/token`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(8000),
    body: JSON.stringify({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI, code_verifier: tx.verifier, client_id: CLIENT_ID, client_secret: secret }),
  });
  if (!tokenRes.ok) return `token_${tokenRes.status}`;
  const tok = await tokenRes.json() as { access_token?: string };
  const jwksRes = await fetch(`${central}/functions/v1/identity/jwks`, { signal: AbortSignal.timeout(5000) });
  if (!jwksRes.ok || typeof tok.access_token !== 'string') return 'jwks';
  const claims = await verifyAccessToken(tok.access_token, await jwksRes.json() as { keys: JsonWebKey[] });
  return claims && claims.iss === ISSUER ? claims : 'token_invalid';
};

/** Store the license id on the account (server-written app_metadata). */
const saveLicense = async (userId: string, claims: Claims): Promise<boolean> => {
  const admin = createAdminClient();
  const { data: current } = await admin.auth.admin.getUserById(userId);
  const meta = { ...(current?.user?.app_metadata ?? {}), pl_lic: claims.lic, pl_sub: claims.sub };
  const { error } = await admin.auth.admin.updateUserById(userId, { app_metadata: meta });
  return !error;
};

/** Parent identity redirect target: exchange the code, verify the token, store the license id, then go home. */
// skipcq: JS-0067 -- Next.js route handler export, not a global
export async function GET(request: NextRequest) {
  const fail = (why: string) => { console.warn('[platform-connect]', { why }); return finish(request, '/license-required'); };
  const redirect = readRedirect(request);
  if ('why' in redirect) return fail(redirect.why);
  const secret = process.env.PLATFORM_ID_CLIENT_SECRET ?? '';
  const central = (process.env.CENTRAL_SUPABASE_URL ?? '').replace(/\/$/, '');
  if (secret.length < 32 || !central.startsWith('https://')) return fail('config');
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail('signed_out');
  try {
    const result = await exchange(central, secret, redirect.tx, redirect.code);
    if (typeof result === 'string') return fail(result);
    if (!(await saveLicense(user.id, result))) return fail('save');
    console.info('[platform-connect]', { why: 'connected' });
    return finish(request, '/home');
  } catch { return fail('error'); }
}
