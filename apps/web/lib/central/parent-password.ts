import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { consumeRateLimit } from '@/lib/api/rate-limit';
import { clientIp } from '@/lib/ops/handoff';
import { CLIENT_ID, ISSUER, PARENT, randomToken, verifyAccessToken, type Claims } from '@/lib/central/parent-connect';
import { boundNonceOk, packParentSession, PARENT_SESSION_COOKIE, PARENT_SESSION_COOKIE_MAX_AGE, PARENT_SESSION_TTL_SECONDS } from '@/lib/central/parent-session';
import { missingRelation, recordParentSessionGrant } from '@/lib/central/parent-data-plane';
import { centralAuthOn, errorFor, matchUser, signinMode, type NwUser } from '@/lib/central/parent-signin';
import { issueSessionForUser } from '@/lib/module-api/auth-signup/lib-auth-issue-session';

/**
 * Central sign-in from the unchanged NuraWell login screen (email + password).
 * The typed credentials go once, server to server, to the parent identity (/id/password, client secret). The parent
 * checks its own account, or — for an existing NuraWell account it does not know yet — verifies the current NuraWell
 * password with NuraWell's auth and creates the parent identity (just-in-time, argon2id, no reset). The answer is the
 * same ES256 access token the redirect flow returns; it is verified here, the nonce is checked, and the normal
 * NuraWell session + parent-session proof are issued. Nothing is stored except the existing pl_lic / pl_sub link.
 */
type Out = { ok: true; next: string } | { fallback: 'native' } | { error: string };
const reply = (status: number, body: Out) => {
  const res = NextResponse.json(body, { status });
  res.headers.set('cache-control', 'no-store');
  return res;
};

const sameOrigin = (request: NextRequest) => {
  const origin = request.headers.get('origin');
  return Boolean(origin) && origin === request.nextUrl.origin;
};

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

const saveLicense = async (userId: string, claims: Claims): Promise<boolean> => {
  const admin = createAdminClient();
  const { data: current } = await admin.auth.admin.getUserById(userId);
  const meta = { ...(current?.user?.app_metadata ?? {}), pl_lic: claims.lic, pl_sub: claims.sub };
  const { error } = await admin.auth.admin.updateUserById(userId, { app_metadata: meta });
  return !error;
};

/** test mode: only accounts marked pl_enforce_test are signed in centrally; everyone else keeps the native login. */
const inTestScope = async (email: string): Promise<boolean> => {
  const user = (await listUsers().catch(() => [] as NwUser[])).find((u) => (u.email ?? '').trim().toLowerCase() === email);
  return user?.app_metadata?.pl_enforce_test === true;
};

/** Parent password grant → verified claims, or a failure reason. */
const parentClaims = async (secret: string, email: string, password: string, ip: string): Promise<Claims | string> => {
  const nonce = randomToken(24);
  const res = await fetch(`${PARENT}/id/password/`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(12000),
    body: JSON.stringify({ client_id: CLIENT_ID, client_secret: secret, email, password, nonce, ip }),
  }).catch(() => null);
  if (!res) return 'unavailable';
  const body = await res.json().catch(() => ({})) as { access_token?: unknown; error?: unknown };
  if (!res.ok) return typeof body.error === 'string' ? body.error : 'unavailable';
  if (typeof body.access_token !== 'string') return 'token';
  const jwks = await fetch(`${PARENT}/id/jwks/`, { signal: AbortSignal.timeout(5000) }).then((r) => (r.ok ? r.json() : null)).catch(() => null) as { keys: JsonWebKey[] } | null;
  if (!jwks) return 'jwks';
  const claims = await verifyAccessToken(body.access_token, jwks as never);
  if (claims?.iss !== ISSUER) return 'token_invalid';
  return boundNonceOk(claims.nonce, nonce) ? claims : 'nonce';
};

const failure = (why: string): [number, Out] => {
  if (why === 'credentials') return [401, { error: 'credentials' }];
  if (why === 'locked' || why === 'rate_limited') return [429, { error: why }];
  return [403, { error: errorFor(why) }];
};

// skipcq: JS-R1005 -- flat fail-closed guards
export async function centralPasswordLogin(request: NextRequest): Promise<NextResponse> {
  if (!sameOrigin(request)) return reply(403, { error: 'origin' });
  const mode = await signinMode();
  if (!centralAuthOn(mode)) return reply(200, { fallback: 'native' });
  const ip = clientIp(request.headers) || 'na';
  const rl = await consumeRateLimit({ key: ip, namespace: 'central-password', limit: 20, windowSeconds: 600 }).catch(() => ({ ok: true as const }));
  if (!rl.ok) return reply(429, { error: 'rate_limited' });
  const b = await request.json().catch(() => null) as { email?: unknown; password?: unknown } | null;
  const email = typeof b?.email === 'string' ? b.email.trim().toLowerCase() : '';
  const password = typeof b?.password === 'string' ? b.password : '';
  if (!email.includes('@') || !password || password.length > 200) return reply(401, { error: 'credentials' });
  const secret = process.env.PLATFORM_ID_CLIENT_SECRET ?? '';
  if (secret.length < 32) return reply(503, { error: errorFor('config') });

  const claims = await parentClaims(secret, email, password, ip);
  if (typeof claims === 'string') {
    console.warn('[platform-password]', { why: claims });
    // test mode: accounts outside the test scope keep today's password login
    if (mode === 'test' && claims !== 'rate_limited' && claims !== 'locked' && !(await inTestScope(email))) return reply(200, { fallback: 'native' });
    const [s, o] = failure(claims);
    return reply(s, o);
  }
  const match = matchUser(await listUsers(), claims, mode);
  if ('refuse' in match) {
    console.info('[platform-password]', { why: match.refuse });
    if (match.refuse === 'out_of_scope') return reply(200, { fallback: 'native' });
    const [s, o] = failure(match.refuse);
    return reply(s, o);
  }
  if (!(await saveLicense(match.user.id, claims))) return reply(503, { error: errorFor('save') });
  const session = await issueSessionForUser(createAdminClient(), match.user.id);
  console.info('[platform-password]', { why: session.ok ? 'signed_in' : session.error, by: match.by });
  if (!session.ok || !session.sessionId) return reply(503, { error: errorFor('session') });

  const nowS = Math.floor(Date.now() / 1000);
  const proof = { product: 'nurawell' as const, userId: match.user.id, sessionId: session.sessionId, parentSub: claims.sub, iat: nowS, exp: nowS + PARENT_SESSION_TTL_SECONDS };
  const packed = packParentSession(proof, secret);
  const recorded = packed ? await recordParentSessionGrant(createAdminClient(), {
    userId: match.user.id, sessionId: session.sessionId, parentSub: claims.sub, issuedAt: nowS, expiresAt: nowS + PARENT_SESSION_TTL_SECONDS,
  }).catch((error: unknown) => (missingRelation(error) ? 'unapplied' as const : 'failed' as const)) : 'failed';
  if (!packed || recorded !== 'recorded') {
    try { await (await createClient()).auth.signOut({ scope: 'local' }); } catch { /* withhold the parent cookie either way */ }
    return reply(503, { error: errorFor('session') });
  }
  const res = reply(200, { ok: true, next: '/home' });
  res.cookies.set(PARENT_SESSION_COOKIE, packed, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: PARENT_SESSION_COOKIE_MAX_AGE });
  return res;
}
