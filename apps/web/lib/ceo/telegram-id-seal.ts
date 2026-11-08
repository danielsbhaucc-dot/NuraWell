/**
 * Telegram routing ids at rest: enc:v2 (system:ops) + keyed HMAC bidx for equality.
 * Decrypt plaintext only at authorized send/allowlist/ownership boundaries. Never log ids/keys.
 */
import { blindIndexFor, encryptValue, decryptValue } from '@/lib/security/field-crypto';
import { SYSTEM_ROW } from '@/lib/security/field-registry';

const OWNER = 'system:ops';

export type TgIdTable =
  | 'admin_passkeys'
  | 'gideon_device_requests'
  | 'gideon_stranger_sim'
  | 'gideon_telegram_identities';
export type TgIdColumn = 'telegram_user_id' | 'chat_id' | 'from_id';

export function normalizeTelegramId(id: string): string {
  return id.normalize('NFKC').trim();
}

export function telegramIdBidx(table: TgIdTable, column: TgIdColumn, id: string): string {
  const plain = normalizeTelegramId(id);
  if (!plain || plain.length > 64) throw new Error('telegram_id_invalid');
  const h = blindIndexFor(table, column, plain);
  if (!h || h.length < 16) throw new Error('telegram_id_bidx_failed');
  return h;
}

export async function sealTelegramId(
  table: TgIdTable,
  column: TgIdColumn,
  id: string,
): Promise<{ sealed: string; bidx: string }> {
  const plain = normalizeTelegramId(id);
  if (!plain || plain.length > 64) throw new Error('telegram_id_invalid');
  if (plain.startsWith('enc:v2:')) throw new Error('telegram_id_already_sealed');
  const sealed = await encryptValue(table, column, OWNER, SYSTEM_ROW, plain);
  if (typeof sealed !== 'string' || !sealed.startsWith('enc:v2:') || sealed.includes(plain)) {
    throw new Error('telegram_id_seal_failed');
  }
  return { sealed, bidx: telegramIdBidx(table, column, plain) };
}

/** Authorized decrypt for routing/allowlist. Returns null on missing/wrong key or non-decryptable. */
export async function decryptTelegramId(
  table: TgIdTable,
  column: TgIdColumn,
  stored: string,
): Promise<string | null> {
  if (!stored) return null;
  if (!stored.startsWith('enc:')) {
    const n = normalizeTelegramId(stored);
    return /^\d{1,20}$/.test(n) ? n : null;
  }
  if (!stored.startsWith('enc:v2:')) return null;
  try {
    const plain = await decryptValue(table, column, OWNER, SYSTEM_ROW, stored);
    if (typeof plain !== 'string' || !plain || plain.startsWith('enc:')) return null;
    const n = normalizeTelegramId(plain);
    return /^\d{1,20}$/.test(n) ? n : null;
  } catch {
    return null;
  }
}

export function telegramIdMatches(
  stored: { value: string | null | undefined; bidx: string | null | undefined },
  candidatePlain: string,
  table: TgIdTable,
  column: TgIdColumn,
): boolean {
  const want = telegramIdBidx(table, column, candidatePlain);
  if (stored.bidx) return stored.bidx === want;
  const v = stored.value;
  if (!v) return false;
  if (v.startsWith('enc:')) return false;
  return normalizeTelegramId(v) === normalizeTelegramId(candidatePlain);
}
