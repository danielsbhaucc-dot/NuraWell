import { describe, expect, it } from 'vitest';
import { authorizeUrl, packTx, pkceChallenge, unpackTx, verifyAccessToken, ISSUER, CLIENT_ID, REDIRECT_URI } from '@/lib/central/parent-connect';

const b64u = (b: Uint8Array | string) => Buffer.from(b).toString('base64url');
const keys = async () => {
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']) as CryptoKeyPair;
  const pub = await crypto.subtle.exportKey('jwk', kp.publicKey);
  return { kp, jwks: { keys: [{ ...pub, kid: 'id1' }] } };
};
const sign = async (kp: CryptoKeyPair, claims: Record<string, unknown>, alg = 'ES256') => {
  const header = b64u(JSON.stringify({ alg, kid: 'id1', typ: 'JWT' }));
  const payload = b64u(JSON.stringify(claims));
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, kp.privateKey, new TextEncoder().encode(`${header}.${payload}`)));
  return `${header}.${payload}.${b64u(sig)}`;
};
const now = Math.floor(Date.now() / 1000);
const good = { iss: ISSUER, aud: CLIENT_ID, sub: 'pairwise-sub', lic: 'lic_pub_abc123', iat: now, exp: now + 300 };

describe('parent connect', () => {
  it('builds an exact authorize URL with PKCE S256', async () => {
    const url = new URL(authorizeUrl('s'.repeat(43), await pkceChallenge('v'.repeat(64))));
    expect(url.origin + url.pathname).toBe('https://platform-core-preview.vercel.app/id/authorize');
    expect(url.searchParams.get('redirect_uri')).toBe(REDIRECT_URI);
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
  it('round-trips and rejects malformed transaction cookies', () => {
    const packed = packTx('a'.repeat(43), 'b'.repeat(64));
    expect(unpackTx(packed)).toEqual({ state: 'a'.repeat(43), verifier: 'b'.repeat(64) });
    expect(unpackTx('x.y')).toBeNull(); expect(unpackTx('')).toBeNull();
  });
  it('accepts a valid token and returns the license id', async () => {
    const { kp, jwks } = await keys();
    expect((await verifyAccessToken(await sign(kp, good), jwks))?.lic).toBe('lic_pub_abc123');
  });
  it('rejects wrong key, issuer, audience, expiry, alg and license format', async () => {
    const { kp, jwks } = await keys(); const other = await keys();
    expect(await verifyAccessToken(await sign(other.kp, good), jwks)).toBeNull();
    for (const bad of [{ iss: 'https://evil/id' }, { aud: 'sample' }, { exp: now - 600 }, { lic: 'nope' }])
      expect(await verifyAccessToken(await sign(kp, { ...good, ...bad }), jwks)).toBeNull();
    expect(await verifyAccessToken(await sign(kp, good, 'none'), jwks)).toBeNull();
    const token = await sign(kp, good); const [header, , sig] = token.split('.');
    expect(await verifyAccessToken(`${header}.${b64u(JSON.stringify({ ...good, lic: 'lic_other1' }))}.${sig}`, jwks)).toBeNull();
  });
});
