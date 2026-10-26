/**
 * Per-user / per-record field encryption (design: docs/security/FIELD_ENCRYPTION_DESIGN.md).
 * Moved verbatim from apps/web/lib/security/field-envelope.ts (phase 2a). Byte-for-byte format is frozen:
 * enc:v2 values and the `nurawell:` AAD namespace are what production data is sealed with. Do not change.
 *
 * Hierarchy (matches docs/KMS_ENVELOPE.md "Extensibility"):
 *   Google KMS KEK -> FIELD_KEK (app master key, KMS-wrapped, injected by the caller) -> per-user DEK -> field.
 * KMS is never called per record. Rotating FIELD_KEK re-wraps DEKs only. Deleting a user's wrapped DEK
 * crypto-shreds every field of that user, including copies inside backups.
 */
import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const FIELD_PREFIX = 'enc:v2:';

export type WrappedDek = { v: 1; kek: 'FIELD_KEK'; kekv: number; wdek: string; aad: string };

function seal(key: Buffer, plain: Buffer, aad: string): Buffer {
  if (key.length !== 32) throw new Error('key must be 32 bytes');
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  c.setAAD(Buffer.from(aad, 'utf8'));
  const ct = Buffer.concat([c.update(plain), c.final()]);
  return Buffer.concat([iv, ct, c.getAuthTag()]);
}

function open(key: Buffer, blob: Buffer, aad: string): Buffer {
  if (key.length !== 32) throw new Error('key must be 32 bytes');
  if (blob.length < 29) throw new Error('ciphertext too short');
  const d = createDecipheriv('aes-256-gcm', key, blob.subarray(0, 12), { authTagLength: 16 });
  d.setAAD(Buffer.from(aad, 'utf8'));
  d.setAuthTag(blob.subarray(blob.length - 16));
  return Buffer.concat([d.update(blob.subarray(12, blob.length - 16)), d.final()]);
}

export const dekScope = (userId: string) => `nurawell:dek:user:${userId}`;
export const fieldAad = (table: string, column: string, rowId: string) => `nurawell:field:${table}:${column}:${rowId}`;

export function newDataKey(fieldKek: Buffer, kekVersion: number, userId: string): { dek: Buffer; wrapped: WrappedDek } {
  const dek = randomBytes(32);
  const aad = dekScope(userId);
  return { dek, wrapped: { v: 1, kek: 'FIELD_KEK', kekv: kekVersion, wdek: seal(fieldKek, dek, aad).toString('base64'), aad } };
}

export function unwrapDataKey(fieldKek: Buffer, wrapped: WrappedDek, userId: string): Buffer {
  if (wrapped.aad !== dekScope(userId)) throw new Error('DEK scope mismatch');
  return open(fieldKek, Buffer.from(wrapped.wdek, 'base64'), wrapped.aad);
}

/** Re-wrap under a new FIELD_KEK version without touching any field data. */
export function rewrapDataKey(oldKek: Buffer, newKek: Buffer, newVersion: number, wrapped: WrappedDek, userId: string): WrappedDek {
  const dek = unwrapDataKey(oldKek, wrapped, userId);
  return { ...wrapped, kekv: newVersion, wdek: seal(newKek, dek, wrapped.aad).toString('base64') };
}

export function encryptField(dek: Buffer, plaintext: string, aad: string): string {
  return FIELD_PREFIX + seal(dek, Buffer.from(plaintext, 'utf8'), aad).toString('base64');
}

export function decryptField(dek: Buffer, value: string, aad: string): string {
  if (!value.startsWith(FIELD_PREFIX)) throw new Error('not an enc:v2 value');
  return open(dek, Buffer.from(value.slice(FIELD_PREFIX.length), 'base64'), aad).toString('utf8');
}

/**
 * Blind index for equality lookups on encrypted fields (e.g. phone, email). Keyed HMAC with a separate key,
 * normalised input, truncated to 16 bytes to limit linkability. Never use for low-entropy fields (weight, yes/no).
 */
export function blindIndex(indexKey: Buffer, field: string, value: string): string {
  const norm = value.normalize('NFKC').trim().toLowerCase();
  return createHmac('sha256', indexKey).update(`${field}\u0000${norm}`).digest().subarray(0, 16).toString('base64url');
}

export function blindIndexEquals(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Migration helper (test rows only until approved): legacy enc:v1 / plaintext -> enc:v2; idempotent. */
export function migrateValue(
  value: string | null,
  ctx: { dek: Buffer; aad: string; decryptLegacy: (v: string) => string },
): { value: string | null; changed: boolean } {
  if (value == null || value === '') return { value, changed: false };
  if (value.startsWith(FIELD_PREFIX)) return { value, changed: false };
  const plain = value.startsWith('enc:v1:') ? ctx.decryptLegacy(value) : value;
  const next = encryptField(ctx.dek, plain, ctx.aad);
  if (decryptField(ctx.dek, next, ctx.aad) !== plain) throw new Error('round-trip verification failed');
  return { value: next, changed: true };
}
