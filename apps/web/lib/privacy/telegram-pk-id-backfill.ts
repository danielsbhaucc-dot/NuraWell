/**
 * Local legacy backfill: gideon_stranger_sim.chat_id + gideon_telegram_identities.from_id → enc:v2 + bidx.
 * Idempotent. Conditional UPDATE (bidx IS NULL AND value = previous). Abort on seal/roundtrip failure.
 * No Telegram HTTP / email. Never logs ids.
 */
import { decryptValue } from '@/lib/security/field-crypto';
import { SYSTEM_ROW } from '@/lib/security/field-registry';
import { normalizeTelegramId, sealTelegramId } from '@/lib/ceo/telegram-id-seal';

export type PkIdRow = { id: string; value: string; bidx: string | null };
export type PkIdPlan = { action: 'skip' } | { action: 'write'; sealed: string; bidx: string; previous: string } | { action: 'fail'; reason: string };
export type PkIdWrite = {
  table: 'gideon_stranger_sim' | 'gideon_telegram_identities';
  id: string;
  sealed: string;
  bidx: string;
  previous: string;
  valueCol: 'chat_id' | 'from_id';
  bidxCol: 'chat_bidx' | 'from_bidx';
};

export async function planPkId(
  table: 'gideon_stranger_sim' | 'gideon_telegram_identities',
  column: 'chat_id' | 'from_id',
  row: PkIdRow,
): Promise<PkIdPlan> {
  if (!row.id) return { action: 'fail', reason: 'missing_id' };
  if (row.bidx) return { action: 'skip' };
  if (!row.value) return { action: 'skip' };
  if (row.value.startsWith('enc:v2:')) return { action: 'skip' };
  if (row.value.startsWith('enc:')) return { action: 'fail', reason: 'unsupported_enc' };
  if (!/^\d{1,20}$/.test(normalizeTelegramId(row.value))) return { action: 'fail', reason: 'not_digit_id' };
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

export async function runTgPkIdBackfill(
  sims: readonly PkIdRow[],
  identities: readonly PkIdRow[],
  write: (w: PkIdWrite) => Promise<boolean>,
  apply: boolean,
) {
  const result = { examined: 0, skipped: 0, planned: 0, written: 0, failed: 0, aborted: false };
  const writes: PkIdWrite[] = [];
  for (const row of sims) {
    result.examined += 1;
    const plan = await planPkId('gideon_stranger_sim', 'chat_id', row);
    if (plan.action === 'fail') { result.failed += 1; result.aborted = true; return result; }
    if (plan.action === 'skip') result.skipped += 1;
    else { result.planned += 1; writes.push({ table: 'gideon_stranger_sim', id: row.id, sealed: plan.sealed, bidx: plan.bidx, previous: plan.previous, valueCol: 'chat_id', bidxCol: 'chat_bidx' }); }
  }
  for (const row of identities) {
    result.examined += 1;
    const plan = await planPkId('gideon_telegram_identities', 'from_id', row);
    if (plan.action === 'fail') { result.failed += 1; result.aborted = true; return result; }
    if (plan.action === 'skip') result.skipped += 1;
    else { result.planned += 1; writes.push({ table: 'gideon_telegram_identities', id: row.id, sealed: plan.sealed, bidx: plan.bidx, previous: plan.previous, valueCol: 'from_id', bidxCol: 'from_bidx' }); }
  }
  if (!apply) return result;
  for (const w of writes) {
    if (!(await write(w))) { result.failed += 1; result.aborted = true; return result; }
    result.written += 1;
  }
  return result;
}
