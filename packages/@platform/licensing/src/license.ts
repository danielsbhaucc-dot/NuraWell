import { randomBytes } from 'node:crypto';
import { b64u, unb64u, canonicalJson } from './b64';
import { ed25519Sign, ed25519Verify } from './keys';
import { satisfies } from './semver';
import { hostMatches } from './match';
export { hostMatches };

export type DistributionMode = 'bundle' | 'source';
export type License = {
  v: 1;
  /** License id: what the revocation list refers to. Random, not derived from the buyer. */
  lid: string;
  moduleId: string;
  versionRange: string;
  licensee: { id: string; name: string };
  /** Exact hostnames; "*.example.com" matches one subdomain level. Empty = not bound (only for source buyouts). */
  domains: string[];
  /** Optional instance fingerprint (sha256 hex chosen by the buyer install). */
  instance?: string;
  mode: DistributionMode;
  issuedAt: string;
  /** End of the paid period (next billing date). Runtime allows graceDays after this. */
  expiresAt: string | null;
  /** Days after expiresAt the module still loads (default 3). Renewed on payment. */
  graceDays: number;
  /** AES-256 content key (base64url) that unwraps the closed-source bundle. Absent for source buyouts. */
  contentKey?: string;
  /** Signed terms-acceptance evidence (no raw PII). */
  termsVersion?: string;
  termsAcceptedAt?: string;
};
export type LicenseInput = Omit<License, 'v' | 'lid' | 'issuedAt' | 'expiresAt' | 'graceDays'> & {
  lid?: string;
  issuedAt?: Date;
  /** Paid period length. null = no expiry (source buyout only). Default 30 (monthly). */
  validDays?: number | null;
  graceDays?: number;
  contentKey?: string;
  termsVersion?: string;
  termsAcceptedAt?: string | Date;
};
export const DEFAULT_VALID_DAYS = 30;
export const DEFAULT_GRACE_DAYS = 3;
const PREFIX = 'nwl1';

export function issueLicense(privatePem: string, input: LicenseInput, now = new Date()): { token: string; license: License } {
  const issued = input.issuedAt ?? now;
  const days = input.validDays === undefined ? DEFAULT_VALID_DAYS : input.validDays;
  const grace = input.graceDays === undefined ? DEFAULT_GRACE_DAYS : input.graceDays;
  if (input.mode === 'bundle' && (days === null || !input.domains.length)) throw new Error('bundle licenses need an expiry and at least one domain');
  if (!Number.isInteger(grace) || grace < 0 || grace > 90) throw new Error('graceDays must be 0..90');
  if (input.contentKey !== undefined && (typeof input.contentKey !== 'string' || !/^[A-Za-z0-9_-]{40,64}$/.test(input.contentKey))) {
    throw new Error('contentKey must be base64url AES-256 key material');
  }
  const termsAcceptedAt = input.termsAcceptedAt
    ? (typeof input.termsAcceptedAt === 'string' ? input.termsAcceptedAt : input.termsAcceptedAt.toISOString())
    : undefined;
  const license: License = {
    v: 1, lid: input.lid ?? randomBytes(9).toString('base64url'), moduleId: input.moduleId, versionRange: input.versionRange,
    licensee: input.licensee, domains: input.domains.map((d) => d.toLowerCase()), instance: input.instance, mode: input.mode,
    issuedAt: issued.toISOString(),
    expiresAt: days === null ? null : new Date(issued.getTime() + days * 86_400_000).toISOString(),
    graceDays: grace,
    ...(input.contentKey ? { contentKey: input.contentKey } : {}),
    ...(input.termsVersion ? { termsVersion: input.termsVersion } : {}),
    ...(termsAcceptedAt ? { termsAcceptedAt } : {}),
  };
  const body = b64u(canonicalJson(license));
  return { token: `${PREFIX}.${body}.${b64u(ed25519Sign(privatePem, `${PREFIX}.${body}`))}`, license };
}

/** Renewal = a new license with the same lid and a fresh paid window (automatable later from a payment webhook). About 1 request per customer per month. */
export function renewLicense(privatePem: string, old: License, validDays = DEFAULT_VALID_DAYS, now = new Date()) {
  const { v: _v, issuedAt: _i, expiresAt: _e, ...rest } = old;
  return issueLicense(privatePem, { ...rest, validDays }, now);
}

export type LicenseCheck =
  | { ok: true; license: License }
  | { ok: false; reason: 'malformed' | 'bad_signature' | 'expired' | 'not_yet_valid' | 'wrong_module' | 'version_out_of_range' | 'domain_mismatch' | 'instance_mismatch'; license?: License };

/** Hard stop = expiresAt + graceDays (or expiresAt alone when graceDays is 0). */
export function effectiveExpiry(l: Pick<License, 'expiresAt' | 'graceDays'>): number | null {
  if (!l.expiresAt) return null;
  const grace = Number.isFinite(l.graceDays) ? l.graceDays : DEFAULT_GRACE_DAYS;
  return Date.parse(l.expiresAt) + grace * 86_400_000;
}

export function verifyLicense(token: string, publicPem: string, ctx: { moduleId: string; version: string; host?: string; instance?: string; now?: Date }): LicenseCheck {
  const parts = typeof token === 'string' ? token.trim().split('.') : [];
  if (parts.length !== 3 || parts[0] !== PREFIX) return { ok: false, reason: 'malformed' };
  if (!ed25519Verify(publicPem, `${parts[0]}.${parts[1]}`, unb64u(parts[2]))) return { ok: false, reason: 'bad_signature' };
  let l: License;
  try { l = JSON.parse(unb64u(parts[1]).toString('utf8')); } catch { return { ok: false, reason: 'malformed' }; }
  if (l.v !== 1) return { ok: false, reason: 'malformed' };
  if (typeof l.graceDays !== 'number') l = { ...l, graceDays: DEFAULT_GRACE_DAYS };
  const now = (ctx.now ?? new Date()).getTime();
  if (Date.parse(l.issuedAt) > now + 5 * 60_000) return { ok: false, reason: 'not_yet_valid', license: l };
  const hard = effectiveExpiry(l);
  if (hard !== null && hard <= now) return { ok: false, reason: 'expired', license: l };
  if (l.moduleId !== ctx.moduleId) return { ok: false, reason: 'wrong_module', license: l };
  if (!satisfies(ctx.version, l.versionRange)) return { ok: false, reason: 'version_out_of_range', license: l };
  if (l.domains.length && !(ctx.host && l.domains.some((d) => hostMatches(ctx.host!, d)))) return { ok: false, reason: 'domain_mismatch', license: l };
  if (l.instance && l.instance !== ctx.instance) return { ok: false, reason: 'instance_mismatch', license: l };
  return { ok: true, license: l };
}

/** Content key from a verified license token. Null when missing or the token does not verify. */
export function contentKeyFromToken(token: string, publicPem: string, ctx: { moduleId: string; version: string; host?: string; instance?: string; now?: Date }): Buffer | null {
  const c = verifyLicense(token, publicPem, ctx);
  if (!c.ok || !c.license.contentKey) return null;
  try { const k = unb64u(c.license.contentKey); return k.length === 32 ? k : null; } catch { return null; }
}
