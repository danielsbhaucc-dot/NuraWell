/**
 * Connect a parent-platform purchase to this NuraWell account (OAuth 2 authorization code + PKCE, client secret).
 * The parent identity returns an ES256 access token whose `lic` claim is the license id; we verify it locally against
 * the parent's public keys and store the id in app_metadata.pl_lic (server-written only). No parent token is kept.
 */
export const PARENT = 'https://platform-core-preview.vercel.app';
export const ISSUER = `${PARENT}/id`;
export const CLIENT_ID = 'nurawell';
export const REDIRECT_URI = 'https://nurawell.vercel.app/api/v1/central/callback';
export const TX_COOKIE = 'pl_connect';

const b64u = (b: Uint8Array) => Buffer.from(b).toString('base64url');
const fromB64u = (s: string) => new Uint8Array(Buffer.from(s, 'base64url'));
export const randomToken = (n = 32) => b64u(crypto.getRandomValues(new Uint8Array(n)));
export async function pkceChallenge(verifier: string): Promise<string> {
  return b64u(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
}

export function authorizeUrl(state: string, challenge: string): string {
  const u = new URL(`${PARENT}/id/authorize`);
  for (const [k, v] of Object.entries({ response_type: 'code', client_id: CLIENT_ID, redirect_uri: REDIRECT_URI, state, code_challenge: challenge, code_challenge_method: 'S256' })) u.searchParams.set(k, v);
  return u.toString();
}

/** Transaction cookie value: state.verifier (both random, base64url). */
export const packTx = (state: string, verifier: string) => `${state}.${verifier}`;
export function unpackTx(v: string | undefined): { state: string; verifier: string } | null {
  const m = /^([A-Za-z0-9_-]{32,64})\.([A-Za-z0-9_-]{43,128})$/.exec(v ?? '');
  return m ? { state: m[1]!, verifier: m[2]! } : null;
}

export type Claims = { iss: string; aud: string; sub: string; lic: string; exp: number; iat: number; email_verified?: boolean };
type Jwk = JsonWebKey & { kid?: string };

/** Verify an ES256 JWT against a JWKS. Returns the claims or null (never throws). */
export async function verifyAccessToken(token: string, jwks: { keys: Jwk[] }, nowS = Math.floor(Date.now() / 1000)): Promise<Claims | null> {
  try {
    const [h, p, s] = token.split('.'); if (!h || !p || !s || token.length > 4000) return null;
    const head = JSON.parse(new TextDecoder().decode(fromB64u(h))) as { alg?: string; kid?: string };
    if (head.alg !== 'ES256') return null;
    const jwk = jwks.keys.find((k) => k.kty === 'EC' && k.crv === 'P-256' && (!head.kid || !k.kid || k.kid === head.kid)); if (!jwk) return null;
    const key = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, fromB64u(s), new TextEncoder().encode(`${h}.${p}`));
    if (!ok) return null;
    const c = JSON.parse(new TextDecoder().decode(fromB64u(p))) as Claims;
    if (c.iss !== ISSUER || c.aud !== CLIENT_ID || typeof c.exp !== 'number' || c.exp < nowS - 30 || typeof c.sub !== 'string') return null;
    if (typeof c.lic !== 'string' || !/^lic_[A-Za-z0-9_-]{4,80}$/.test(c.lic)) return null;
    return c;
  } catch { return null; }
}
