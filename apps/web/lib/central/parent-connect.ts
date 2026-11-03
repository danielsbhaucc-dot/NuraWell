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
/** R20 sign-in transaction (no NuraWell session yet): state.verifier.nonce. */
export const SIGNIN_COOKIE = 'pl_signin';

const b64u = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64url');
const fromB64u = (text: string) => new Uint8Array(Buffer.from(text, 'base64url'));
const decodeJson = <T>(part: string): T => JSON.parse(new TextDecoder().decode(fromB64u(part))) as T;

/** Random base64url token of `size` bytes. */
export const randomToken = (size = 32) => b64u(crypto.getRandomValues(new Uint8Array(size)));

/** PKCE S256 challenge for a verifier. */
export const pkceChallenge = async (verifier: string): Promise<string> =>
  b64u(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));

/** Parent authorize URL for this client. */
export const authorizeUrl = (state: string, challenge: string, nonce?: string): string => {
  const url = new URL(`${PARENT}/id/authorize`);
  const params = { response_type: 'code', client_id: CLIENT_ID, redirect_uri: REDIRECT_URI, state, code_challenge: challenge, code_challenge_method: 'S256' };
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
  if (nonce) url.searchParams.set('nonce', nonce);
  return url.toString();
};

/** Transaction cookie value: state.verifier (both random, base64url). */
export const packTx = (state: string, verifier: string) => `${state}.${verifier}`;

/** Parse the transaction cookie; null when missing or malformed. */
export const unpackTx = (raw: string | undefined): { state: string; verifier: string } | null => {
  const match = /^([A-Za-z0-9_-]{32,64})\.([A-Za-z0-9_-]{43,128})$/.exec(raw ?? '');
  const [, state, verifier] = match ?? [];
  return state && verifier ? { state, verifier } : null;
};

/** Sign-in transaction cookie: state.verifier.nonce. */
export const packSigninTx = (state: string, verifier: string, nonce: string) => `${state}.${verifier}.${nonce}`;
const SIGNIN_TX_RE = /^([A-Za-z0-9_-]{32,64})\.([A-Za-z0-9_-]{43,128})\.([A-Za-z0-9_-]{16,128})$/;
// skipcq: JS-R1005 -- one regex, typed fallbacks
export const unpackSigninTx = (raw: string | undefined): { state: string; verifier: string; nonce: string } | null => {
  const match = SIGNIN_TX_RE.exec(raw ?? '');
  return match ? { state: match[1] as string, verifier: match[2] as string, nonce: match[3] as string } : null;
};

export type Claims = { iss: string; aud: string; sub: string; lic: string; exp: number; iat: number; email?: string; email_verified?: boolean; nonce?: string };
type Jwk = JsonWebKey & { kid?: string };
type Head = { alg?: string; kid?: string };

const pickKey = (jwks: { keys: Jwk[] }, head: Head): Jwk | undefined =>
  jwks.keys.find((key) => key.kty === 'EC' && key.crv === 'P-256' && (!head.kid || !key.kid || key.kid === head.kid));

const signatureOk = async (jwk: Jwk, signed: string, signature: string): Promise<boolean> => {
  const key = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  return crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, fromB64u(signature), new TextEncoder().encode(signed));
};

const timeOk = (claims: Claims, nowS: number) => typeof claims.exp === 'number' && claims.exp >= nowS - 30;
const whoOk = (claims: Claims) => claims.iss === ISSUER && claims.aud === CLIENT_ID && typeof claims.sub === 'string';
const licOk = (claims: Claims) => typeof claims.lic === 'string' && /^lic_[A-Za-z0-9_-]{4,80}$/.test(claims.lic);
const claimsOk = (claims: Claims, nowS: number): boolean => timeOk(claims, nowS) && whoOk(claims) && licOk(claims);

type Parts = { header: string; payload: string; signature: string };
const splitToken = (token: string): Parts | null => {
  const match = /^([\w-]{1,1500})\.([\w-]{1,2000})\.([\w-]{1,400})$/.exec(token);
  if (!match) return null;
  const [, header, payload, signature] = match as unknown as [string, string, string, string];
  return { header, payload, signature };
};

const keyFor = (jwks: { keys: Jwk[] }, header: string): Jwk | undefined => {
  const head = decodeJson<Head>(header);
  return head.alg === 'ES256' ? pickKey(jwks, head) : undefined;
};

const partsVerified = (parts: Parts, jwks: { keys: Jwk[] }): Promise<boolean> => {
  const jwk = keyFor(jwks, parts.header);
  return jwk ? signatureOk(jwk, `${parts.header}.${parts.payload}`, parts.signature) : Promise.resolve(false);
};

/** Verify an ES256 JWT against a JWKS. Returns the claims or null (never throws). */
export const verifyAccessToken = async (token: string, jwks: { keys: Jwk[] }, nowS = Math.floor(Date.now() / 1000)): Promise<Claims | null> => {
  try {
    const parts = splitToken(token);
    if (!parts || !(await partsVerified(parts, jwks))) return null;
    const claims = decodeJson<Claims>(parts.payload);
    return claimsOk(claims, nowS) ? claims : null;
  } catch { return null; }
};
