import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const KEYLEN = 32;

/** פורמט: scrypt$<salt_b64url>$<hash_b64url> */
export function hashDemoPassword(password: string): string {
  const salt = randomBytes(16).toString('base64url');
  const hash = scryptSync(password.normalize('NFKC'), salt, KEYLEN).toString('base64url');
  return `scrypt$${salt}$${hash}`;
}

export function verifyDemoPassword(password: string, stored: string | null | undefined): boolean {
  if (!stored) return true;
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, expected] = parts;
  if (!salt || !expected) return false;
  const actual = scryptSync(password.normalize('NFKC'), salt, KEYLEN).toString('base64url');
  const a = Buffer.from(actual, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
