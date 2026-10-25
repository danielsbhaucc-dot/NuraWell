import 'server-only';
import { createPublicKey, createVerify, type JsonWebKey } from 'node:crypto';

/**
 * Verifies a Google-signed ID token (RS256) for machine-to-machine calls from our own GCP
 * service accounts. Checks signature (Google JWKS), iss, aud (exact), exp/iat, email_verified and
 * an exact service-account allowlist. Fails closed on anything unexpected.
 */
type Jwk = JsonWebKey & { kid?: string };
let jwksCache: { at: number; keys: Jwk[] } | null = null;
let fetchJwks: () => Promise<Jwk[]> = async () => {
  const r = await fetch('https://www.googleapis.com/oauth2/v3/certs', { cache: 'no-store' });
  if (!r.ok) throw new Error('jwks_' + r.status);
  return ((await r.json()) as { keys: Jwk[] }).keys;
};
export function __setJwksFetcher(f: (() => Promise<Jwk[]>) | null) {
  jwksCache = null;
  fetchJwks = f ?? (async () => { const r = await fetch('https://www.googleapis.com/oauth2/v3/certs', { cache: 'no-store' }); return ((await r.json()) as { keys: Jwk[] }).keys; });
}

export type VerifiedCaller = { email: string };

export async function verifyGoogleIdToken(token: string | null | undefined, opts: { audience: string; allowedEmails: readonly string[]; now?: number }): Promise<VerifiedCaller | null> {
  try {
    if (!token || token.length > 4096) return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString()) as { alg?: string; kid?: string };
    if (header.alg !== 'RS256' || !header.kid) return null;
    if (!jwksCache || Date.now() - jwksCache.at > 3_600_000) jwksCache = { at: Date.now(), keys: await fetchJwks() };
    const jwk = jwksCache.keys.find((k) => k.kid === header.kid);
    if (!jwk) return null;
    const v = createVerify('RSA-SHA256');
    v.update(`${parts[0]}.${parts[1]}`);
    if (!v.verify(createPublicKey({ key: jwk, format: 'jwk' }), Buffer.from(parts[2], 'base64url'))) return null;
    const p = JSON.parse(Buffer.from(parts[1], 'base64url').toString()) as { iss?: string; aud?: string; exp?: number; iat?: number; email?: string; email_verified?: boolean };
    const now = Math.floor((opts.now ?? Date.now()) / 1000);
    if (p.iss !== 'https://accounts.google.com' && p.iss !== 'accounts.google.com') return null;
    if (p.aud !== opts.audience) return null;
    if (typeof p.exp !== 'number' || p.exp < now - 30) return null;
    if (typeof p.iat !== 'number' || p.iat > now + 60 || p.exp - p.iat > 3700) return null;
    if (p.email_verified !== true || !p.email || !opts.allowedEmails.includes(p.email)) return null;
    return { email: p.email };
  } catch {
    return null;
  }
}
