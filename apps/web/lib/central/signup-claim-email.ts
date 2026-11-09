/**
 * parent_signup_claims.email — sealed at rest + keyed HMAC blind index for SQL equality in parent_signup_begin.
 * Nonce remains the claim lock. Never log plaintext, ciphertext, bidx, or key material.
 */
import { blindIndexFor, encryptValue } from '@/lib/security/field-crypto';
import { SYSTEM_ROW } from '@/lib/security/field-registry';

const OWNER = 'system:audit';
export const SIGNUP_EMAIL_MAX_PLAIN = 320;

export function normalizeSignupEmail(email: string): string {
  return email.normalize('NFKC').trim().toLowerCase();
}

/** Keyed blind index (HKDF from PII_ENCRYPTION_KEY). Throws if key missing. */
export function signupEmailBidx(email: string): string {
  const plain = normalizeSignupEmail(email);
  if (!plain || plain.length < 3 || plain.length > SIGNUP_EMAIL_MAX_PLAIN) throw new Error('signup_email_invalid');
  const h = blindIndexFor('parent_signup_claims', 'email', plain);
  if (!h || h.length < 16) throw new Error('signup_email_bidx_failed');
  return h;
}

/** enc:v2 under system:audit / SYSTEM_ROW. Throws if key missing or seal fails. */
export async function sealSignupEmail(email: string): Promise<string> {
  const plain = normalizeSignupEmail(email);
  if (!plain || plain.length < 3 || plain.length > SIGNUP_EMAIL_MAX_PLAIN) throw new Error('signup_email_invalid');
  if (plain.startsWith('enc:v2:')) return plain;
  const cipher = await encryptValue('parent_signup_claims', 'email', OWNER, SYSTEM_ROW, plain);
  if (typeof cipher !== 'string' || !cipher.startsWith('enc:v2:') || cipher.includes(plain)) {
    throw new Error('signup_email_seal_failed');
  }
  return cipher;
}

export async function sealSignupEmailBinding(email: string): Promise<{ sealed: string; bidx: string }> {
  const sealed = await sealSignupEmail(email);
  const bidx = signupEmailBidx(email);
  return { sealed, bidx };
}
