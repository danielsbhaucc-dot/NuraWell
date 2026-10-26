import { b64u, unb64u, canonicalJson } from './b64';
import { ed25519Sign, ed25519Verify } from './keys';

export type RevocationState = 'suspended_until' | 'suspended_until_payment' | 'revoked_permanent';
/** Public entry: license id + state only. Reasons never leave our DB (stored enc:v2 there). */
export type RevocationEntry = { lid: string; state: RevocationState; until?: string };
export type RevocationList = { v: 1; version: number; issuedAt: string; entries: RevocationEntry[] };
export type SignedRevocationList = { list: RevocationList; sig: string };

export function signRevocationList(privatePem: string, list: Omit<RevocationList, 'v'>): SignedRevocationList {
  if (!Number.isInteger(list.version) || list.version < 1) throw new Error('version must be a positive integer');
  for (const e of list.entries) {
    if (e.state === 'suspended_until' && !e.until) throw new Error('suspended_until needs a date');
    for (const k of Object.keys(e)) if (!['lid', 'state', 'until'].includes(k)) throw new Error(`entry field "${k}" not allowed in the public list`);
  }
  const full: RevocationList = { v: 1, ...list };
  return { list: full, sig: b64u(ed25519Sign(privatePem, canonicalJson(full))) };
}

export function verifyRevocationList(doc: unknown, publicPem: string): RevocationList | null {
  const d = doc as SignedRevocationList | null;
  if (!d || typeof d.sig !== 'string' || !d.list || d.list.v !== 1 || !Array.isArray(d.list.entries)) return null;
  return ed25519Verify(publicPem, canonicalJson(d.list), unb64u(d.sig)) ? d.list : null;
}

/** Is this license blocked by the list right now? suspended_until auto-lifts after the date. */
export function revocationFor(list: RevocationList | null, lid: string, now = new Date()): RevocationEntry | null {
  const e = list?.entries.find((x) => x.lid === lid);
  if (!e) return null;
  if (e.state === 'suspended_until' && e.until && Date.parse(e.until) <= now.getTime()) return null;
  return e;
}
