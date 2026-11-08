/**
 * Telegram routing ids stored at rest: enc:v2 (system:ops) + keyed HMAC bidx for equality.
 * Decrypt plaintext only at authorized send/ownership boundaries. Never log ids/keys.
 */
import { blindIndexFor, encryptValue } from '@/lib/security/field-crypto';
import { SYSTEM_ROW } from '@/lib/security/field-registry';

const OWNER = 'system:ops';

export function normalizeTelegramId(id: string): string {
  return id.normalize('NFKC').trim();
}

export function telegramIdBidx(table: 'admin_passkeys' | 'gideon_device_requests', column: 'telegram_user_id' | 'chat_id', id: string): string {
  const plain = normalizeTelegramId(id);
  if (!plain || plain.length > 64) throw new Error('telegram_id_invalid');
  const h = blindIndexFor(table, column, plain);
  if (!h || h.length < 16) throw new Error('telegram_id_bidx_failed');
  return h;
}

export async function sealTelegramId(
  table: 'admin_passkeys' | 'gideon_device_requests',
  column: 'telegram_user_id' | 'chat_id',
  id: string,
): Promise<{ sealed: string; bidx: string }> {
  const plain = normalizeTelegramId(id);
  if (!plain || plain.length > 64) throw new Error('telegram_id_invalid');
  if (plain.startsWith('enc:v2:')) {
    return { sealed: plain, bidx: telegramIdBidx(table, column, plain) }; // should not happen for plain path
  }
  const sealed = await encryptValue(table, column, OWNER, SYSTEM_ROW, plain);
  if (typeof sealed !== 'string' || !sealed.startsWith('enc:v2:') || sealed.includes(plain)) {
    throw new Error('telegram_id_seal_failed');
  }
  return { sealed, bidx: telegramIdBidx(table, column, plain) };
}

/** Ownership / equality after read: prefer bidx; legacy plaintext; sealed-without-bidx fail-closed. */
export function telegramIdMatches(
  stored: { value: string | null | undefined; bidx: string | null | undefined },
  candidatePlain: string,
  table: 'admin_passkeys' | 'gideon_device_requests',
  column: 'telegram_user_id' | 'chat_id',
): boolean {
  const want = telegramIdBidx(table, column, candidatePlain);
  if (stored.bidx) return stored.bidx === want;
  const v = stored.value;
  if (!v) return false;
  if (v.startsWith('enc:')) return false; // sealed without index — fail closed
  return normalizeTelegramId(v) === normalizeTelegramId(candidatePlain);
}
