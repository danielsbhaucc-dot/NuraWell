/**
 * Signed module manifest for light products (Stage 2: installable library modules for on-device products).
 * Central signs { v, product, issuedAt, modules[] } with the same ECDSA P-256 key as the license status file
 * (public key: packages/customers-licensing/keys/status-public.jwk.json). The product verifies it locally and keeps
 * the last verified copy, so it works offline. Unsigned, wrong-product or malformed manifests are ignored (fail-safe:
 * the product keeps its built-in behaviour). Only module ids, versions and kit refs travel; no user data.
 */
import { b64u } from '@core/crypto';
import { canonical } from '@core/audit';

export interface SignedManifest { payload: string; sig: string }
export interface ManifestModule { id: string; version: string; ref: string }
export interface ModuleManifest { v: 1; product: string; issuedAt: string; modules: ManifestModule[] }

const ID = /^[a-z][a-z0-9-]{1,40}$/, REF = /^[A-Za-z0-9._-]{1,60}$/, VER = /^[0-9A-Za-z.+-]{1,20}$/;
export const isSignedManifest = (x: unknown): x is SignedManifest =>
  !!x && typeof x === 'object' && typeof (x as SignedManifest).payload === 'string' && typeof (x as SignedManifest).sig === 'string'
  && (x as SignedManifest).payload.length <= 8192 && (x as SignedManifest).sig.length <= 200;

function shape(x: unknown, productId: string): ModuleManifest | null {
  if (!x || typeof x !== 'object') return null;
  const m = x as ModuleManifest;
  if (m.v !== 1 || m.product !== productId || typeof m.issuedAt !== 'string' || Number.isNaN(Date.parse(m.issuedAt)) || !Array.isArray(m.modules) || m.modules.length > 50) return null;
  const mods: ManifestModule[] = [];
  for (const e of m.modules) {
    if (!e || typeof e !== 'object' || !ID.test(e.id) || !VER.test(String(e.version)) || !REF.test(e.ref)) return null;
    mods.push({ id: e.id, version: String(e.version), ref: e.ref });
  }
  return { v: 1, product: m.product, issuedAt: m.issuedAt, modules: mods };
}

/** Verifies signature + shape + product. Null on any problem (never throws). */
export async function verifyManifest(s: unknown, pub: CryptoKey, productId: string): Promise<ModuleManifest | null> {
  try {
    if (!isSignedManifest(s)) return null;
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, b64u.decode(s.sig) as BufferSource, new TextEncoder().encode(s.payload));
    return ok ? shape(JSON.parse(s.payload), productId) : null;
  } catch { return null; }
}

/** Central side: canonical payload + ECDSA signature (the private key never leaves the function). */
export async function signManifest(m: Omit<ModuleManifest, 'v'>, priv: CryptoKey): Promise<SignedManifest> {
  const payload = canonical({ v: 1, ...m });
  return { payload, sig: b64u.encode(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, priv, new TextEncoder().encode(payload))) };
}
