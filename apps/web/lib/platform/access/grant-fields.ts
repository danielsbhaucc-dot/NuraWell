/**
 * Grant content fields after the field wrapper has decrypted them.
 * Ciphertext is not a fallback display / compare value. Legacy plaintext still reads.
 * Entitlement does not use ticket_ref or country text.
 */
import { encryptValue } from '@/lib/security/field-crypto';
import { SYSTEM_ROW } from '@/lib/security/field-registry';

const OWNER = 'system:audit';
export const TICKET_REF_MAX = 40;
export const COUNTRY_MAX_PLAIN = 2;

export function readableGrantReason(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  if (value.startsWith('enc:')) return null;
  return value;
}

export function readableTicketRef(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  if (value.startsWith('enc:')) return null;
  return value;
}

/** 2-letter country only; ciphertext must not enter new_country Set compares. */
export function readableCountry(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  if (value.startsWith('enc:')) return null;
  return value;
}

export async function sealTicketRef(value: string | null): Promise<string | null> {
  if (value === null || value === undefined || value === '') return null;
  if (value.startsWith('enc:v2:')) return value;
  const plain = value.slice(0, TICKET_REF_MAX);
  const cipher = await encryptValue('pii_access_grants', 'ticket_ref', OWNER, SYSTEM_ROW, plain);
  if (typeof cipher !== 'string' || !cipher.startsWith('enc:v2:') || (plain.length >= 8 && cipher.includes(plain))) {
    throw new Error('ticket_ref_seal_failed');
  }
  return cipher;
}

export async function sealGrantCountry(value: string | null): Promise<string | null> {
  if (value === null || value === undefined || value === '') return null;
  if (value.startsWith('enc:v2:')) return value;
  const plain = value.slice(0, COUNTRY_MAX_PLAIN);
  const cipher = await encryptValue('pii_access_grants', 'country', OWNER, SYSTEM_ROW, plain);
  if (typeof cipher !== 'string' || !cipher.startsWith('enc:v2:') || (plain.length >= 8 && cipher.includes(plain))) {
    throw new Error('grant_country_seal_failed');
  }
  return cipher;
}
