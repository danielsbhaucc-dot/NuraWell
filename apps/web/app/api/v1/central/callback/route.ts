import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { timingSafeEqualStr } from '@/lib/api/timing-safe-equal';
import { CLIENT_ID, ISSUER, REDIRECT_URI, SIGNIN_COOKIE, TX_COOKIE, unpackSigninTx, unpackTx, verifyAccessToken, type Claims } from '@/lib/central/parent-connect';
import { errorFor, matchUser, signinMode, type NwUser } from '@/lib/central/parent-signin';
import { issueSessionForUser } from '@/lib/auth/issue-session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 20;

type Tx = { state: string; verifier: string };

const finish = (request: NextRequest, path: string) => {
  const res = NextResponse.redirect(new URL(path, request.url));
  res.cookies.set(TX_COOKIE, '', { httpOnly: true, secure: true, sameSite: 'lax', path: '/api/v1/central', maxAge: 0 });
  res.cookies.set(SIGNIN_COOKIE, '', { httpOnly: true, secure: true, sameSite: 'lax', path: '/api/v1/central', maxAge: 0 });
  res.headers.set('cache-control', 'no-store');
  return res;
};

const stateMatches = (tx: Tx | null, state: string): tx is Tx => tx !== null && state !== '' && timingSafeEqualStr(state, tx.state);
const codeOk = (code: string) => /^[A-Za-z0-9_-]{16,100}$/.test(code);

/** Validate the redirect: returns the transaction and code, or a failure reason. */
const readRedirect = (request: NextRequest): { tx: Tx; code: string } | { why: string } => {
  const tx = unpackTx(request.cookies.get(TX_COOKIE)?.value);
  const params = request.nextUrl.searchParams;
  const code = String(params.get('code'));
  if (!stateMatches(tx, String(params.get('state')))) return { why: 'state' };
  const err = params.get('error');
  if (err) return { why: err };
  return codeOk(code) ? { tx, code } : { why: 'code' };
};

/** Server config for the exchange, or null when incomplete. */
const readConfig = (): { central: string; secret: string } | null => {
  const secret = process.env.PLATFORM_ID_CLIENT_SECRET ?? '';
  const central = (process.env.CENTRAL_SUPABASE_URL ?? '').replace(/\/$/, '');
  return secret.length >= 32 && central.startsWith('https://') ? { central, secret } : null;
};

const fetchAccessToken = async (central: string, secret: string, tx: Tx, code: string): Promise<string | null> => {
  const res = await fetch(`${central}/functions/v1/identity/token`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(8000),
    body: JSON.stringify({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI, code_verifier: tx.verifier, client_id: CLIENT_ID, client_secret: secret }),
  });
  if (!res.ok) { console.warn('[platform-connect]', { why: 'token', status: res.status }); return null; }
  const tok = await res.json() as { access_token?: unknown };
  return typeof tok.access_token === 'string' ? tok.access_token : null;
};

const fetchJwks = async (central: string): Promise<{ keys: JsonWebKey[] } | null> => {
  const res = await fetch(`${central}/functions/v1/identity/jwks`, { signal: AbortSignal.timeout(5000) });
  return res.ok ? await res.json() as { keys: JsonWebKey[] } : null;
};

/** Exchange the code and verify the access token. Returns the claims or a failure reason. */
const exchange = async (central: string, secret: string, tx: Tx, code: string): Promise<Claims | string> => {
  const token = await fetchAccessToken(central, secret, tx, code);
  if (!token) return 'token';
  const jwks = await fetchJwks(central);
  if (!jwks) return 'jwks';
  const claims = await verifyAccessToken(token, jwks);
  return claims?.iss === ISSUER ? claims : 'token_invalid';
};

/** Store the license id on the account (server-written app_metadata). */
const saveLicense = async (userId: string, claims: Claims): Promise<boolean> => {
  const admin = createAdminClient();
  const { data: current } = await admin.auth.admin.getUserById(userId);
  const meta = { ...(current?.user?.app_metadata ?? {}), pl_lic: claims.lic, pl_sub: claims.sub };
  const { error } = await admin.auth.admin.updateUserById(userId, { app_metadata: meta });
  return !error;
};

/** Exchange, verify and save for the signed-in user. Returns null on success, else a failure reason. */
const connect = async (config: { central: string; secret: string }, tx: Tx, code: string): Promise<string | null> => {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return 'signed_out';
    const result = await exchange(config.central, config.secret, tx, code);
    if (typeof result === 'string') return result;
    return (await saveLicense(user.id, result)) ? null : 'save';
  } catch { return 'error'; }
};

/** All NuraWell accounts (small user base; paged, capped). */
const listUsers = async (): Promise<NwUser[]> => {
  const admin = createAdminClient(), out: NwUser[] = [];
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    out.push(...(data.users as NwUser[]));
    if (data.users.length < 1000) break;
  }
  return out;
};

/** R20 sign-in branch: verify (incl. nonce + verified email), find the NuraWell account, mint a NuraWell session. */
const signIn = async (request: NextRequest): Promise<string | null> => {
  const tx = unpackSigninTx(request.cookies.get(SIGNIN_COOKIE)?.value);
  const params = request.nextUrl.searchParams;
  if (!tx || !stateMatches(tx, String(params.get('state')))) return 'state';
  if (params.get('error')) return String(params.get('error')).slice(0, 40);
  const code = String(params.get('code'));
  if (!codeOk(code)) return 'code';
  const mode = await signinMode();
  if (mode === 'off') return 'off';
  const config = readConfig();
  if (!config) return 'config';
  const claims = await exchange(config.central, config.secret, tx, code);
  if (typeof claims === 'string') return claims;
  if (!claims.nonce || !timingSafeEqualStr(claims.nonce, tx.nonce)) return 'nonce';
  const m = matchUser(await listUsers(), claims, mode);
  if ('refuse' in m) return m.refuse;
  if (!(await saveLicense(m.user.id, claims))) return 'save';
  const s = await issueSessionForUser(createAdminClient(), m.user.id);
  console.info('[platform-signin]', { why: s.ok ? 'signed_in' : s.error, by: m.by });
  return s.ok ? null : 'session';
};

/** Parent identity redirect target: exchange the code, verify the token, store the license id, then go home. */
// skipcq: JS-0067 -- Next.js route handler export, not a global
export async function GET(request: NextRequest) {
  if (request.cookies.get(SIGNIN_COOKIE)?.value && !request.cookies.get(TX_COOKIE)?.value) {
    const why = await signIn(request).catch(() => 'error');
    if (why) { console.warn('[platform-signin]', { why }); return finish(request, `/login?e=${errorFor(why)}`); }
    return finish(request, '/home');
  }
  const fail = (why: string) => { console.warn('[platform-connect]', { why }); return finish(request, '/license-required'); };
  const redirect = readRedirect(request);
  if ('why' in redirect) return fail(redirect.why);
  const config = readConfig();
  if (!config) return fail('config');
  const why = await connect(config, redirect.tx, redirect.code);
  if (why) return fail(why);
  console.info('[platform-connect]', { why: 'connected' });
  return finish(request, '/home');
}
