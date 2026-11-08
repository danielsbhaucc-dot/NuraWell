/**
 * Local legacy backfill: admin_passkeys.telegram_user_id + gideon_device_requests.chat_id → enc:v2 + bidx.
 * Idempotent. Conditional UPDATE (bidx IS NULL AND value = previous). No Telegram API. Never logs ids.
 */
import { decryptValue } from '@/lib/security/field-crypto';
import { SYSTEM_ROW } from '@/lib/security/field-registry';
import { normalizeTelegramId, sealTelegramId } from '@/lib/ceo/telegram-id-seal';

export type TgIdRow = { id: string; value: string; bidx: string | null };
export type TgIdPlan = { action: 'skip' } | { action: 'write'; sealed: string; bidx: string; previous: string } | { action: 'fail'; reason: string };
export type TgIdWrite = { table: 'admin_passkeys' | 'gideon_device_requests'; id: string; sealed: string; bidx: string; previous: string; valueCol: string; bidxCol: string };

export async function planTgId(
  table: 'admin_passkeys' | 'gideon_device_requests',
  column: 'telegram_user_id' | 'chat_id',
  row: TgIdRow,
): Promise<TgIdPlan> {
  if (!row.id) return { action: 'fail', reason: 'missing_id' };
  if (row.bidx) return { action: 'skip' };
  if (!row.value) return { action: 'skip' };
  if (row.value.startsWith('enc:v2:')) return { action: 'skip' };
  if (row.value.startsWith('enc:')) return { action: 'fail', reason: 'unsupported_enc' };
  let sealed: string; let bidx: string;
  try {
    ({ sealed, bidx } = await sealTelegramId(table, column, row.value));
  } catch {
    return { action: 'fail', reason: 'seal_or_key' };
  }
  let back: unknown;
  try {
    back = await decryptValue(table, column, 'system:ops', SYSTEM_ROW, sealed);
  } catch {
    return { action: 'fail', reason: 'decrypt' };
  }
  if (back !== normalizeTelegramId(row.value)) return { action: 'fail', reason: 'roundtrip' };
  return { action: 'write', sealed, bidx, previous: row.value };
}

export async function runTgDeviceIdBackfill(
  passkeys: readonly TgIdRow[],
  devices: readonly TgIdRow[],
  write: (w: TgIdWrite) => Promise<boolean>,
  apply: boolean,
) {
  const result = { examined: 0, skipped: 0, planned: 0, written: 0, failed: 0, aborted: false };
  const writes: TgIdWrite[] = [];
  for (const row of passkeys) {
    result.examined += 1;
    const plan = await planTgId('admin_passkeys', 'telegram_user_id', row);
    if (plan.action === 'fail') { result.failed += 1; result.aborted = true; return result; }
    if (plan.action === 'skip') result.skipped += 1;
    else { result.planned += 1; writes.push({ table: 'admin_passkeys', id: row.id, sealed: plan.sealed, bidx: plan.bidx, previous: plan.previous, valueCol: 'telegram_user_id', bidxCol: 'telegram_user_bidx' }); }
  }
  for (const row of devices) {
    result.examined += 1;
    const plan = await planTgId('gideon_device_requests', 'chat_id', row);
    if (plan.action === 'fail') { result.failed += 1; result.aborted = true; return result; }
    if (plan.action === 'skip') result.skipped += 1;
    else { result.planned += 1; writes.push({ table: 'gideon_device_requests', id: row.id, sealed: plan.sealed, bidx: plan.bidx, previous: plan.previous, valueCol: 'chat_id', bidxCol: 'chat_bidx' }); }
  }
  if (!apply) return result;
  for (const w of writes) {
    if (!(await write(w))) { result.failed += 1; result.aborted = true; return result; }
    result.written += 1;
  }
  return result;
}
