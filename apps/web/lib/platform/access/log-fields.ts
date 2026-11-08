/**
 * pii_access_log.country / resource — append-only journal fields (seal on INSERT only).
 * No SQL filters. audit-job compares country in memory via readableCountry after decrypt.
 */
import { encryptValue } from '@/lib/security/field-crypto';
import { SYSTEM_ROW } from '@/lib/security/field-registry';

const OWNER = 'system:audit';
export const LOG_RESOURCE_MAX = 80;
export const LOG_COUNTRY_MAX = 2;

export async function sealLogCountry(value: unknown): Promise<string | null> {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') throw new Error('log_country_type');
  if (value.startsWith('enc:v2:')) return value;
  const plain = value.slice(0, LOG_COUNTRY_MAX);
  const cipher = await encryptValue('pii_access_log', 'country', OWNER, SYSTEM_ROW, plain);
  if (typeof cipher !== 'string' || !cipher.startsWith('enc:v2:') || cipher.includes(plain)) throw new Error('log_country_seal_failed');
  return cipher;
}

export async function sealLogResource(value: unknown): Promise<string> {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value !== 'string') throw new Error('log_resource_type');
  if (value.startsWith('enc:v2:')) return value;
  const plain = value.slice(0, LOG_RESOURCE_MAX);
  if (!plain) return '';
  const cipher = await encryptValue('pii_access_log', 'resource', OWNER, SYSTEM_ROW, plain);
  if (typeof cipher !== 'string' || !cipher.startsWith('enc:v2:') || cipher.includes(plain)) throw new Error('log_resource_seal_failed');
  return cipher;
}

export function readableLogResource(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) return '';
  if (value.startsWith('enc:')) return '';
  return value;
}
