/**
 * A grant reason the server may use after the field wrapper has decrypted it.
 * Ciphertext is not a reason and is not a fallback. Legacy plaintext (15–500) still reads.
 * The entitlement decision does not use this text.
 */
export function readableGrantReason(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  if (value.startsWith('enc:')) return null;
  return value;
}
