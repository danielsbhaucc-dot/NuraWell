/**
 * access_audit_runs.error is an operational failure note (≤120 chars plaintext), not a query key.
 * New writes seal enc:v2 under system:audit. Ciphertext is not a fallback display string.
 */
import { encryptValue } from '@/lib/security/field-crypto';
import { SYSTEM_ROW } from '@/lib/security/field-registry';

const OWNER = 'system:audit';
export const RUN_ERROR_MAX_PLAIN = 120;

export async function sealRunError(value: string | null): Promise<string | null> {
  if (value === null || value === undefined || value === '') return null;
  if (value.startsWith('enc:v2:')) return value;
  const plain = value.slice(0, RUN_ERROR_MAX_PLAIN);
  const cipher = await encryptValue('access_audit_runs', 'error', OWNER, SYSTEM_ROW, plain);
  if (typeof cipher !== 'string' || !cipher.startsWith('enc:v2:') || cipher.includes(plain)) {
    throw new Error('run_error_seal_failed');
  }
  return cipher;
}

/** Legacy plaintext still readable; ciphertext is not treated as a human message. */
export function readableRunError(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  if (value.startsWith('enc:')) return null;
  return value;
}
