import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** אסימון גולמי באורך גבוה — רק ליוצר הקישור / ל-URL. */
export function generateDemoAccessToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashDemoAccessToken(rawToken: string): string {
  return createHash('sha256').update(rawToken, 'utf8').digest('hex');
}

export function tokensMatch(rawToken: string, tokenHash: string): boolean {
  const a = Buffer.from(hashDemoAccessToken(rawToken), 'utf8');
  const b = Buffer.from(tokenHash, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
