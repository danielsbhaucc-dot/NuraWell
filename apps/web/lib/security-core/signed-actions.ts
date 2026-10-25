/**
 * Signed one-tap action tokens for chat buttons (`<id>.<mac>`, fits Telegram's 64-byte callback_data).
 * Product-agnostic: the signing key is passed in. The id is a random nonce stored server-side (single use, TTL).
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const newNonceId = () => randomBytes(12).toString('base64url');
export const macFor = (kind: string, id: string, key: string) => createHmac('sha256', key).update(`tg-ir:${kind}:${id}`).digest('base64url').slice(0, 22);
export function verifyToken(kind: string, token: string, key: string): string | null {
  const m = /^([A-Za-z0-9_-]{12,20})\.([A-Za-z0-9_-]{22})$/.exec(token);
  if (!m) return null;
  const want = Buffer.from(macFor(kind, m[1], key));
  const got = Buffer.from(m[2]);
  return want.length === got.length && timingSafeEqual(want, got) ? m[1] : null;
}
