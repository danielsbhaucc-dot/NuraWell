import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { timingSafeEqualStr } from '@/lib/api/timing-safe-equal';
import { CLIENT_ID, ISSUER, PARENT, REDIRECT_URI, SIGNIN_COOKIE, TX_COOKIE, tokenRequest, unpackSigninTx, unpackTx, verifyAccessToken, type Claims } from '@/lib/central/parent-connect';
import { boundNonceOk, packParentSession, PARENT_SESSION_COOKIE, PARENT_SESSION_COOKIE_MAX_AGE, PARENT_SESSION_TTL_SECONDS } from '@/lib/central/parent-session';
import { missingRelation, recordParentSessionGrant } from '@/lib/central/parent-data-plane';
import { licenseReasonFor } from '@/lib/central/license-gate';
import { entitlementAllowsProvision, packProvision, PROVISION_COOKIE, provisionRefusal } from '@/lib/central/parent-provision';
import { matchUser, signinFailurePath, signinMode, type NwUser } from '@/lib/central/parent-signin';
import { issueSessionForUser } from '@/lib/module-api/auth-signup/lib-auth-issue-session';

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
  // Contract host is the parent origin. The hub service-role key is not an identity credential.
  return secret.length >= 32 ? { central: PARENT, secret } : null;
};

const fetchAccessToken = async (central: string, secret: string, tx: Tx, code: string): Promise<string | null> => {
  const token = tokenRequest(central, { code, verifier: tx.verifier, secret });
  const res = await fetch(token.url, {
    method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(8000),
    body: JSON.stringify(token.body),
  });
  if (!res.ok) { console.warn('[platform-connect]', { why: 'token', status: res.status }); return null; }
  const tok = await res.json() as { access_token?: unknown };
  return typeof tok.access_token === 'string' ? tok.access_token : null;
};

const fetchJwks = async (central: string): Promise<{ keys: JsonWebKey[] } | null> => {
  const res = await fetch(`${central}/id/jwks`, { signal: AbortSignal.timeout(5000) });
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

type SigninTx = Tx & { nonce: string; intent?: 'login' | 'signup' };
type ProvisionBody = { product: 'nurawell'; sub: string; lic: string; email: string; nonce: string; verified: true };
type SigninOutcome = string | { kind: 'provision'; provision: ProvisionBody } | { kind: 'session'; sessionId: string; userId: string; parentSub: string };

/** Validate the sign-in redirect (cookie, state, error, code). */
const readSigninRedirect = (request: NextRequest): { tx: SigninTx; code: string } | { why: string } => {
  const tx = unpackSigninTx(request.cookies.get(SIGNIN_COOKIE)?.value);
  const params = request.nextUrl.searchParams;
  if (!tx || !stateMatches(tx, String(params.get('state')))) return { why: 'state' };
  if (params.get('error')) return { why: String(params.get('error')).slice(0, 40) };
  const code = String(params.get('code'));
  return codeOk(code) ? { tx, code } : { why: 'code' };
};

/** Exchange + verify, then require the nonce we bound to this browser. */
const signinClaims = async (tx: SigninTx, code: string): Promise<Claims | string> => {
  const config = readConfig();
  if (!config) return 'config';
  const claims = await exchange(config.central, config.secret, tx, code);
  if (typeof claims === 'string') return claims;
  return boundNonceOk(claims.nonce, tx.nonce) ? claims : 'nonce';
};

/** New product account: verified parent email plus an active license. No parent user is created. */
const provisionOutcome = async (claims: { sub: string; lic: string; email?: string; email_verified?: boolean }, nonce: string): Promise<SigninOutcome> => {
  const refusal = provisionRefusal(claims);
  if (refusal) return refusal;
  const reason = await licenseReasonFor(claims.lic);
  if (!entitlementAllowsProvision(reason)) return 'no_license';
  return { kind: 'provision', provision: { product: 'nurawell', sub: claims.sub, lic: claims.lic, email: String(claims.email), nonce, verified: true } };
};

/** R20 sign-in branch: verify (incl. nonce + verified email), find the NuraWell account, mint a NuraWell session. */
// skipcq: JS-R1005 -- flat sequence of fail-closed guards
const signIn = async (request: NextRequest): Promise<SigninOutcome> => {
  const redirect = readSigninRedirect(request);
  if ('why' in redirect) return redirect.why;
  const mode = await signinMode();
  if (mode === 'off') return 'off';
  const claims = await signinClaims(redirect.tx, redirect.code);
  if (typeof claims === 'string') return claims;
  const match = matchUser(await listUsers(), claims, mode);
  if ('refuse' in match) return match.refuse === 'no_account' && redirect.tx.intent === 'signup' ? provisionOutcome(claims, redirect.tx.nonce) : match.refuse;
  if (!(await saveLicense(match.user.id, claims))) return 'save';
  const session = await issueSessionForUser(createAdminClient(), match.user.id);
  console.info('[platform-signin]', { why: session.ok ? 'signed_in' : session.error, by: match.by });
  if (!session.ok || !session.sessionId) return 'session';
  return { kind: 'session', sessionId: session.sessionId, userId: match.user.id, parentSub: claims.sub };
};

/** Sign-in transaction present (and no connect transaction) ⇒ this redirect is a sign-in. */
const isSignin = (request: NextRequest) => Boolean(request.cookies.get(SIGNIN_COOKIE)?.value) && !request.cookies.get(TX_COOKIE)?.value;

const finishSignin = async (request: NextRequest) => {
  const intent = unpackSigninTx(request.cookies.get(SIGNIN_COOKIE)?.value)?.intent ?? 'login';
  const outcome = await signIn(request).catch(() => 'error' as const);
  if (typeof outcome === 'object' && outcome.kind === 'session') {
    const nowS = Math.floor(Date.now() / 1000);
    const packed = packParentSession({
      product: 'nurawell', userId: outcome.userId, sessionId: outcome.sessionId, parentSub: outcome.parentSub,
      iat: nowS, exp: nowS + PARENT_SESSION_TTL_SECONDS,
    }, process.env.PLATFORM_ID_CLIENT_SECRET ?? '');
    if (!packed) return finish(request, signinFailurePath('config', intent));
    const recorded = await recordParentSessionGrant(createAdminClient(), {
      userId: outcome.userId, sessionId: outcome.sessionId, parentSub: outcome.parentSub,
      issuedAt: nowS, expiresAt: nowS + PARENT_SESSION_TTL_SECONDS,
    }).catch((error: unknown) => (missingRelation(error) ? 'unapplied' as const : 'failed' as const));
    if (recorded !== 'recorded') {
      try { await (await createClient()).auth.signOut({ scope: 'local' }); } catch { /* withhold the parent cookie either way */ }
      return finish(request, signinFailurePath('session', intent));
    }
    const res = finish(request, '/home');
    res.cookies.set(PARENT_SESSION_COOKIE, packed, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: PARENT_SESSION_COOKIE_MAX_AGE });
    return res;
  }
  if (typeof outcome === 'object' && outcome.kind === 'provision') {
    const packed = packProvision({ ...outcome.provision, exp: Math.floor(Date.now() / 1000) + 600 }, process.env.PLATFORM_ID_CLIENT_SECRET ?? '');
    if (!packed) return finish(request, signinFailurePath('config', intent));
    const res = finish(request, signinFailurePath('no_account', 'signup', true));
    res.cookies.set(PROVISION_COOKIE, packed, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 600 });
    return res;
  }
  console.warn('[platform-signin]', { why: outcome });
  return finish(request, signinFailurePath(outcome, intent));
};

/** Parent identity redirect target: exchange the code, verify the token, store the license id, then go home. */
// skipcq: JS-0067, JS-R1005 -- Next.js route handler export; flat guards
export async function GET(request: NextRequest) {
  if (isSignin(request)) return finishSignin(request);
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
