/**
 * Canonical hashing + Ed25519 signing for consent evidence. Pure (no DB) so it is unit-testable.
 * Key: CONSENT_SIGNING_PRIVATE_KEY = base64 PKCS#8 DER Ed25519 (server-only env, never logged).
 */
import { createHash, createPrivateKey, createPublicKey, sign, verify, type KeyObject } from 'node:crypto';
import { RETIRED_SIGNING_KEYS } from './signing-keys-retired';

export const GENESIS = 'GENESIS';

export function sha256Hex(data: string | Buffer | Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

/** Stable JSON: sorted keys, no whitespace. */
export function canonicalJson(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(',')}}`;
}

export type EvidencePayload = {
  v: 1 | 2;
  user_id: string;
  consent_type: string;
  action: 'grant' | 'withdraw';
  source: string;
  text_version: string;
  rendered_sha256: string;
  typed_word: string;
  checkbox_checked: boolean;
  ip_hash: string | null;
  user_agent: string | null;
  session_id: string | null;
  device_id: string | null;
  screenshot_sha256: string | null;
  created_at: string;
  prev_hash: string;
  /** v2: SHA-256 of the canonical consent text object (title/body/word) the server rendered. */
  consent_text_sha256?: string;
  /** v2: platform request id (x-vercel-id) so the record can be matched to platform request logs. */
  request_id?: string | null;
  /** v2: byte size of the normalized screenshot whose hash is signed. */
  screenshot_bytes?: number | null;
  /** v2: browser-claimed device facts (capture time, screen/viewport size, typing duration). */
  client?: Record<string, unknown> | null;
  /** v2: ordered full-sheet capture segments (segment 1 == screenshot_sha256). */
  screenshot_segments?: Array<{ i: number; sha256: string; bytes: number }> | null;
};

export function recordHash(payloadJson: string): string {
  return sha256Hex(payloadJson);
}

let cached: { priv: KeyObject; pub: KeyObject; keyId: string } | null = null;
export function __resetSigningKeyCache() { cached = null; }

export function signingKey(): { priv: KeyObject; pub: KeyObject; keyId: string } {
  if (cached) return cached;
  const raw = process.env.CONSENT_SIGNING_PRIVATE_KEY?.trim();
  if (!raw) throw new Error('CONSENT_SIGNING_PRIVATE_KEY missing');
  const priv = createPrivateKey({ key: Buffer.from(raw, 'base64'), format: 'der', type: 'pkcs8' });
  const pub = createPublicKey(priv);
  const keyId = sha256Hex(pub.export({ format: 'der', type: 'spki' })).slice(0, 16);
  cached = { priv, pub, keyId };
  return cached;
}

/** SHA-256 over the SPKI DER of the signing public key (hex, colon-free). */
export function publicKeyFingerprint(pem?: string): string {
  const k = pem ? createPublicKey(pem) : signingKey().pub;
  return sha256Hex(k.export({ format: 'der', type: 'spki' }));
}

export function publicKeyPem(): string {
  return signingKey().pub.export({ format: 'pem', type: 'spki' }).toString();
}

export function signHash(hashHex: string): { signature: string; keyId: string } {
  const k = signingKey();
  return { signature: sign(null, Buffer.from(hashHex, 'utf8'), k.priv).toString('base64'), keyId: k.keyId };
}

/**
 * Verifies with an explicit key, or (default) the current key and then every retired public key,
 * so signatures made before a key rotation stay valid.
 */
export function verifySignature(hashHex: string, signatureB64: string, pubPem?: string): boolean {
  const tryKey = (k: KeyObject | string) => {
    try {
      return verify(null, Buffer.from(hashHex, 'utf8'), typeof k === 'string' ? createPublicKey(k) : k, Buffer.from(signatureB64, 'base64'));
    } catch {
      return false;
    }
  };
  if (pubPem) return tryKey(pubPem);
  let current: KeyObject | null = null;
  try {
    current = signingKey().pub;
  } catch {
    current = null;
  }
  if (current && tryKey(current)) return true;
  return RETIRED_SIGNING_KEYS.some((r) => tryKey(r.pem));
}

export type PublishedSigningKey = { key_id: string; fingerprint_sha256: string; status: 'current' | 'retired'; valid_from: string | null; retired_at: string | null; pem: string };

/** Current + all retired public keys, for /.well-known publication. */
export function publishedSigningKeys(): PublishedSigningKey[] {
  const out: PublishedSigningKey[] = [];
  try {
    const pem = publicKeyPem();
    out.push({ key_id: signingKey().keyId, fingerprint_sha256: publicKeyFingerprint(pem), status: 'current', valid_from: null, retired_at: null, pem });
  } catch {
    /* current key unavailable: still publish retired keys */
  }
  for (const r of RETIRED_SIGNING_KEYS) {
    out.push({ key_id: r.keyId, fingerprint_sha256: publicKeyFingerprint(r.pem), status: 'retired', valid_from: r.validFrom, retired_at: r.retiredAt, pem: r.pem });
  }
  return out;
}

export type StoredRecord = {
  id: string;
  payload_json: string;
  record_hash: string;
  prev_hash: string;
  signature: string;
  rendered_html: string;
  rendered_sha256: string;
  created_at: string;
};

export type ChainCheck = { id: string; ok: boolean; problems: string[] };

/** Re-derives every hash, link and signature of one user's chain (ordered oldest first). */
export function verifyChain(records: StoredRecord[], pubPem?: string): { ok: boolean; results: ChainCheck[] } {
  let prev = GENESIS;
  const results = records.map((r) => {
    const problems: string[] = [];
    let p: Partial<EvidencePayload> = {};
    try { p = JSON.parse(r.payload_json); } catch { problems.push('payload_unparseable'); }
    if (recordHash(r.payload_json) !== r.record_hash) problems.push('record_hash_mismatch');
    if (p.prev_hash !== r.prev_hash || r.prev_hash !== prev) problems.push('chain_break');
    if (sha256Hex(r.rendered_html) !== r.rendered_sha256 || p.rendered_sha256 !== r.rendered_sha256) problems.push('snapshot_hash_mismatch');
    if (!verifySignature(r.record_hash, r.signature, pubPem)) problems.push('signature_invalid');
    prev = r.record_hash;
    return { id: r.id, ok: problems.length === 0, problems };
  });
  return { ok: results.every((x) => x.ok), results };
}
