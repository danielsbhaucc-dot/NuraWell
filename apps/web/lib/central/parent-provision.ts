import { createHmac, timingSafeEqual } from 'node:crypto';
import type { SigninMode } from './parent-signin';
import { centralAuthOn } from './parent-signin';

/** Short-lived proof that this browser finished parent OIDC with an active NuraWell license. */
export const PROVISION_COOKIE = 'pl_provision';

export type ProvisionProof = { sub: string; lic: string; email: string; exp: number };
export type ParentIdentity = { sub: string; lic: string; email?: string; email_verified?: boolean };

const LIC = /^lic_[A-Za-z0-9_-]{4,80}$/;
const norm = (email: unknown) => (typeof email === 'string' ? email.trim().toLowerCase() : '');

/**
 * A new product account is allowed only after the parent token proved a verified email and a license id.
 * The license id still has to be active in the signed status before the cookie is issued.
 */
export function provisionRefusal(claims: ParentIdentity): 'unverified' | 'no_license' | null {
  if (claims.email_verified !== true || !norm(claims.email)) return 'unverified';
  if (!LIC.test(claims.lic) || typeof claims.sub !== 'string' || claims.sub.length < 4) return 'no_license';
  return null;
}

/** Only an explicit active entitlement may open product onboarding. Missing or stale status does not. */
export function entitlementAllowsProvision(reason: string): boolean {
  return reason === 'active';
}

/** Local Face ID / QR / passkey sessions are a bypass while central-only mode is on. */
export function localMethodAllowed(mode: SigninMode): boolean {
  return !centralAuthOn(mode);
}

export function packProvision(proof: ProvisionProof, secret: string): string | null {
  if (secret.length < 32) return null;
  const email = norm(proof.email);
  if (!email || !LIC.test(proof.lic) || proof.sub.length < 4 || !Number.isFinite(proof.exp)) return null;
  const body = Buffer.from(JSON.stringify({ sub: proof.sub, lic: proof.lic, email, exp: proof.exp })).toString('base64url');
  const mac = createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${mac}`;
}

export function unpackProvision(raw: string | undefined, secret: string, nowS = Math.floor(Date.now() / 1000)): ProvisionProof | null {
  if (!raw || secret.length < 32) return null;
  const cut = raw.lastIndexOf('.');
  if (cut < 1) return null;
  const body = raw.slice(0, cut);
  const mac = raw.slice(cut + 1);
  const expect = createHmac('sha256', secret).update(body).digest('base64url');
  const got = Buffer.from(mac);
  const want = Buffer.from(expect);
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString()) as Partial<ProvisionProof>;
    if (typeof parsed.exp !== 'number' || parsed.exp < nowS) return null;
    if (typeof parsed.sub !== 'string' || typeof parsed.lic !== 'string' || typeof parsed.email !== 'string') return null;
    if (provisionRefusal({ sub: parsed.sub, lic: parsed.lic, email: parsed.email, email_verified: true })) return null;
    return { sub: parsed.sub, lic: parsed.lic, email: norm(parsed.email), exp: parsed.exp };
  } catch {
    return null;
  }
}

/** Central-only: the form email must be the verified parent email. Off: the existing onboarding path is unchanged. */
export function allowProductProvision(mode: SigninMode, proof: ProvisionProof | null, formEmail: string): 'skip' | 'ok' | 'missing' | 'email' {
  if (!centralAuthOn(mode)) return 'skip';
  if (!proof) return 'missing';
  if (proof.email !== norm(formEmail)) return 'email';
  return 'ok';
}
