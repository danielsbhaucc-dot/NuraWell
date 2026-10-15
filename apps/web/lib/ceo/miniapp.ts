import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/** Verify Telegram Mini App initData (HMAC with key = HMAC("WebAppData", botToken)). Returns the Telegram user id. */
export function verifyInitData(initData: string, botToken: string, maxAgeSec = 600, now = Date.now()): { userId: string } | null {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return null;
    params.delete('hash');
    const dataCheck = [...params.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => `${k}=${v}`).join('\n');
    const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
    const calc = createHmac('sha256', secret).update(dataCheck).digest('hex');
    const a = Buffer.from(calc);
    const b = Buffer.from(hash);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const authDate = Number(params.get('auth_date'));
    if (!authDate || now / 1000 - authDate > maxAgeSec) return null;
    const user = JSON.parse(params.get('user') ?? 'null') as { id?: number } | null;
    return user?.id ? { userId: String(user.id) } : null;
  } catch {
    return null;
  }
}

/** Digest of the device's biometric-protected secret (256-bit random → plain SHA-256 is appropriate). */
export const deviceSecretDigest = (secret: string) => createHash('sha256').update(`tg-bio:${secret}`).digest('hex');
