/**
 * ops_device_enrollments.label / location are browser facts (≤80 chars), not query keys.
 * Lookups use id / token_hash. Same system:ops key as ops_login_requests.
 */
import { encryptValue } from '@/lib/security/field-crypto';
import { SYSTEM_ROW } from '@/lib/security/field-registry';

const OWNER = 'system:ops';
export const ENROLL_FACT_MAX_PLAIN = 80;

export async function sealEnrollFact(column: 'label' | 'location', value: string): Promise<string> {
  const plain = value.slice(0, ENROLL_FACT_MAX_PLAIN);
  if (!plain) return '';
  if (plain.startsWith('enc:v2:')) return plain;
  const cipher = await encryptValue('ops_device_enrollments', column, OWNER, SYSTEM_ROW, plain);
  if (typeof cipher !== 'string' || !cipher.startsWith('enc:v2:') || cipher.includes(plain)) {
    throw new Error('enroll_fact_seal_failed');
  }
  return cipher;
}

/** Legacy plaintext still readable; ciphertext is not a display string. */
export function readableEnrollFact(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) return '';
  if (value.startsWith('enc:')) return '';
  return value;
}
