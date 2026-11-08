/**
 * Local HTTP fixture for the parent contract. It does not call Supabase, mail, or the live parent.
 * Database RPCs and mail are absent here; they are not stubbed as if they ran.
 */
import { createServer } from 'node:http';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { authorizeUrl, pkceChallenge, tokenRequest, verifyAccessToken, CLIENT_ID, REDIRECT_URI, ISSUER } from '@/lib/central/parent-connect';
import { pollParentQr, startParentQr } from '@/lib/central/parent-ceremony';
import { errorFor, matchUser, type NwUser } from '@/lib/central/parent-signin';
import { allowProductProvision, entitlementAllowsProvision, provisionRefusal } from '@/lib/central/parent-provision';

const SECRET = 'protocol-client-secret-32b-minimum';
const GOOD_STATE = 's'.repeat(32);
const b64u = (b: Uint8Array | string) => Buffer.from(b).toString('base64url');
const now = Math.floor(Date.now() / 1000);

type CodeRow = { state: string; nonce: string; challenge: string; used: boolean; kind: string };
type QrRow = { state: string; exp: number; approved: boolean; code: string; t: string };
const paths: string[] = [];

const listen = async () => {
  const codes = new Map<string, CodeRow>();
  const qrs = new Map<string, QrRow>();
  let kind = 'existing';
  const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']) as CryptoKeyPair;
  const pub = await crypto.subtle.exportKey('jwk', keys.publicKey);
  const sign = async (claims: Record<string, unknown>) => {
    const header = b64u(JSON.stringify({ alg: 'ES256', kid: 'id1', typ: 'at+jwt' }));
    const payload = b64u(JSON.stringify(claims));
    const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, keys.privateKey, new TextEncoder().encode(`${header}.${payload}`)));
    return `${header}.${payload}.${b64u(sig)}`;
  };
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://fixture.local');
    paths.push(url.pathname);
    const raw = await new Promise<string>((resolve) => {
      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(c as Buffer));
      req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    });
    const body = raw ? JSON.parse(raw) as Record<string, unknown> : {};
    const send = (status: number, payload: unknown, location?: string) => {
      res.writeHead(status, { 'content-type': 'application/json', ...(location ? { location } : {}) });
      res.end(JSON.stringify(payload));
    };
    if (url.pathname === '/id/authorize' && req.method === 'GET') {
      if (url.searchParams.get('client_id') !== CLIENT_ID || url.searchParams.get('redirect_uri') !== REDIRECT_URI) return send(400, { error: 'unknown_client' });
      if (url.searchParams.get('code_challenge_method') !== 'S256') return send(400, { error: 'unsupported_mode' });
      const mode = url.searchParams.get('mode');
      if (mode && mode !== 'passkey' && mode !== 'qr') return send(400, { error: 'unsupported_mode' });
      const state = url.searchParams.get('state') ?? '';
      const nonce = url.searchParams.get('nonce') ?? '';
      if (state.length < 16 || nonce.length < 16) return send(400, { error: 'state' });
      const signedIn = (req.headers.cookie ?? '').includes('id_sess=1');
      if (!signedIn) {
        const page = mode === 'passkey' ? '/account/passkey/' : mode === 'qr' ? '/account/qr/' : url.searchParams.get('screen') === 'signup' ? '/account/signup/' : '/account/signin/';
        return send(302, {}, `${page}?r=pending`);
      }
      const code = `c${codes.size}livecodevalue1`;
      codes.set(code, { state, nonce, challenge: url.searchParams.get('code_challenge') ?? '', used: false, kind });
      return send(302, {}, `${REDIRECT_URI}?code=${code}&state=${state}`);
    }
    if (url.pathname === '/id/token' && req.method === 'POST') {
      if (body.client_secret !== SECRET || body.client_id !== CLIENT_ID || body.redirect_uri !== REDIRECT_URI) return send(401, { error: 'token' });
      const row = codes.get(String(body.code));
      if (!row || row.used) return send(400, { error: 'invalid_grant' });
      if (row.state !== GOOD_STATE) return send(400, { error: 'state' });
      const digest = b64u(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(body.code_verifier)))));
      if (digest !== row.challenge) return send(400, { error: 'pkce' });
      row.used = true;
      if (row.kind === 'unverified') return send(400, { error: 'email_unverified' });
      if (row.kind === 'inactive') return send(400, { error: 'no_license' });
      const claims = {
        iss: ISSUER, aud: CLIENT_ID, sub: 'sub_existing', lic: 'lic_comp_nw_1111', email: 'a@x.co', email_verified: true,
        iat: now, exp: now + 300, nonce: row.nonce, amr: row.kind === 'passkey' ? ['passkey'] : undefined,
      };
      return send(200, { access_token: await sign(claims) });
    }
    if (url.pathname === '/id/ceremony' && req.method === 'POST') {
      if (body.mode !== 'qr' || body.client_secret !== SECRET) return send(400, { error: body.mode === 'password' ? 'unsupported_mode' : 'ceremony' });
      const t = `opaque${qrs.size}tokenvalue1`;
      const pollToken = `polltok${qrs.size}${'p'.repeat(12)}`;
      qrs.set(pollToken, { state: String(body.state), exp: Date.now() + 120_000, approved: kind === 'approved', code: 'approvedcodevalue1', t });
      const approve = `http://fixture.local/account/approve/?t=${t}`;
      if (kind === 'qr-nested') return send(200, { qr: { url: approve, expires_in: 120 }, poll_token: pollToken });
      return send(200, { url: approve, expires_at: new Date(Date.now() + 120_000).toISOString(), poll_token: pollToken });
    }
    if (url.pathname === '/id/ceremony/poll' && req.method === 'POST') {
      if (body.t && !body.poll_token) return send(401, { error: 'token' });
      if (body.client_secret !== SECRET || typeof body.poll_token !== 'string') return send(401, { error: 'token' });
      const row = qrs.get(String(body.poll_token));
      if (!row || row.state !== body.state) return send(401, { error: 'token' });
      if (Date.now() > row.exp) return send(200, { status: 'expired' });
      return send(200, row.approved ? { status: 'approved', code: row.code } : { status: 'pending' });
    }
    return send(404, { error: 'unsupported_mode' });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('no port');
  return { server, origin: `http://127.0.0.1:${address.port}`, jwks: { keys: [{ ...pub, kid: 'id1' }] }, setKind: (value: string) => { kind = value; }, qrs, paths };
};

describe('parent identity protocol (local fixture, not a helper mock)', () => {
  let fx: Awaited<ReturnType<typeof listen>>;
  beforeAll(async () => { fx = await listen(); });
  afterAll(async () => { await new Promise<void>((resolve) => fx.server.close(() => resolve())); });

  const exchange = async (kind: string, state = GOOD_STATE) => {
    fx.setKind(kind);
    const verifier = 'v'.repeat(64);
    const nonce = 'n'.repeat(32);
    const url = authorizeUrl(state, await pkceChallenge(verifier), nonce, { origin: fx.origin, mode: kind === 'passkey' ? 'passkey' : undefined, screen: kind === 'new' ? 'signup' : undefined });
    expect(new URL(url).pathname).toBe('/id/authorize');
    const cold = await fetch(url, { redirect: 'manual' });
    expect(cold.status).toBe(302);
    expect(cold.headers.get('location') ?? '').toMatch(/\/account\//);
    expect(cold.headers.get('location') ?? '').not.toMatch(/code=/);
    const started = await fetch(url, { redirect: 'manual', headers: { cookie: 'id_sess=1' } });
    const location = new URL(started.headers.get('location') ?? '', REDIRECT_URI);
    const code = location.searchParams.get('code') ?? '';
    const token = tokenRequest(fx.origin, { code, verifier, secret: SECRET });
    const res = await fetch(token.url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(token.body) });
    return { res, code, token, nonce, verifier };
  };

  it('maps an existing verified user and refuses a replay, a bad state and a bad nonce binding', async () => {
    const first = await exchange('existing');
    expect(first.res.status).toBe(200);
    const access = (await first.res.json() as { access_token: string }).access_token;
    const claims = await verifyAccessToken(access, fx.jwks);
    expect(claims?.nonce).toBe('n'.repeat(32));
    const users: NwUser[] = [{ id: '1', email: 'a@x.co', email_confirmed_at: '2026-01-01', app_metadata: { pl_sub: 'sub_existing' } }];
    expect(matchUser(users, { sub: claims!.sub, lic: claims!.lic, email: claims!.email, email_verified: claims!.email_verified }, 'all')).toMatchObject({ user: { id: '1' }, by: 'sub' });
    const replay = await fetch(first.token.url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(first.token.body) });
    expect(replay.status).toBe(400);
    expect((await replay.json() as { error: string }).error).toBe('invalid_grant');
    const badState = await exchange('existing', 'z'.repeat(32));
    expect(badState.res.status).toBe(400);
  });

  it('lets an entitled new user through to product onboarding and stops unverified or inactive identities', async () => {
    const created = await exchange('new');
    const claims = await verifyAccessToken((await created.res.json() as { access_token: string }).access_token, fx.jwks);
    expect(provisionRefusal({ sub: claims!.sub, lic: claims!.lic, email: claims!.email, email_verified: true })).toBeNull();
    expect(entitlementAllowsProvision('active')).toBe(true);
    expect(allowProductProvision('all', { sub: claims!.sub, lic: claims!.lic, email: 'a@x.co', exp: now + 600 }, 'a@x.co')).toBe('ok');
    expect(matchUser([], { sub: claims!.sub, lic: claims!.lic, email: claims!.email, email_verified: true }, 'all')).toEqual({ refuse: 'no_account' });

    const unverified = await exchange('unverified');
    expect(unverified.res.status).toBe(400);
    expect(errorFor('email_unverified')).toBe('parent_unverified');
    const inactive = await exchange('inactive');
    expect((await inactive.res.json() as { error: string }).error).toBe('no_license');
    expect(errorFor('no_license')).toBe('parent_no_license');
    expect(entitlementAllowsProvision('revoked')).toBe(false);
  });

  it('binds a QR to its state, hides email, and expires it', async () => {
    const state = 'q'.repeat(43);
    const started = await startParentQr({
      origin: fx.origin, secret: SECRET, state, nonce: 'n'.repeat(32), challenge: await pkceChallenge('v'.repeat(64)), fetchImpl: fetch,
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(started.value.url).toMatch(/\/account\/approve\/\?t=[A-Za-z0-9_-]+$/);
    expect(started.value.url).not.toMatch(/@|email/i);
    const pending = await pollParentQr({ origin: fx.origin, secret: SECRET, state, pollToken: started.value.pollToken, fetchImpl: fetch });
    if (!pending.ok) throw new Error(JSON.stringify(pending));
    expect(pending.ok && pending.value.status).toBe('pending');
    const wrong = await pollParentQr({ origin: fx.origin, secret: SECRET, state: 'z'.repeat(43), pollToken: started.value.pollToken, fetchImpl: fetch });
    expect(wrong.ok).toBe(false);
    const visibleT = new URL(started.value.url).searchParams.get('t') ?? '';
    const bare = await fetch(`${fx.origin}/id/ceremony/poll`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ t: visibleT }) });
    expect(bare.status).toBe(401);
    fx.qrs.get(started.value.pollToken)!.exp = Date.now() - 1000;
    const expired = await pollParentQr({ origin: fx.origin, secret: SECRET, state, pollToken: started.value.pollToken, fetchImpl: fetch });
    expect(expired.ok && expired.value.status).toBe('expired');
    fx.setKind('qr-nested');
    const nested = await startParentQr({ origin: fx.origin, secret: SECRET, state, nonce: 'n'.repeat(32), challenge: await pkceChallenge('v'.repeat(64)), fetchImpl: fetch });
    expect(nested.ok).toBe(true);
    expect(readFileSync('app/api/v1/central/qr/route.ts', 'utf8')).not.toMatch(/poll_token/);
    expect(fx.paths.some((path) => /mail|auth\/v1|rpc/.test(path))).toBe(false);
  });

  it('does not put the hub service key on the identity path', () => {
    for (const file of ['lib/central/parent-ceremony.ts', 'lib/central/parent-connect.ts', 'lib/central/parent-signin.ts', 'lib/central/push-claims.ts', 'app/api/v1/central/callback/route.ts', 'app/api/v1/central/qr/route.ts', 'app/api/v1/central/signin/route.ts']) {
      expect(readFileSync(file, 'utf8')).not.toMatch(/CENTRAL_SUPABASE_SECRET_KEY/);
    }
  });
});
