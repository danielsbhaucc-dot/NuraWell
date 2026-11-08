/**
 * המרה מקומית של access_audit_findings.signals גלוי ל-enc:v2 לכל איבר במערך.
 * מנה של 25. אין לוג של הקודים. enc:v2 לא נדרס.
 */
import { decryptValue, encryptValue } from '@/lib/security/field-crypto';
import { SYSTEM_ROW } from '@/lib/security/field-registry';

export const SIGNALS_BATCH = 25;
const OWNER = 'system:audit';
const CODE = /^[a-z0-9_]{2,40}$/;

export type SignalsRow = { id: string; signals: unknown };
export type SignalsWrite = { id: string; ciphertext: string[]; previous: string[] };
export type SignalsPlan = { action: 'skip' } | { action: 'write'; ciphertext: string[] } | { action: 'fail' };
export type SignalsBatchResult = { examined: number; skipped: number; planned: number; written: number; failed: number; aborted: boolean };

export async function planSignals(value: unknown): Promise<SignalsPlan> {
  if (value === null || value === undefined) return { action: 'skip' };
  if (!Array.isArray(value)) return { action: 'fail' };
  if (value.length === 0) return { action: 'skip' };
  if (value.every((x) => typeof x === 'string' && x.startsWith('enc:v2:'))) return { action: 'skip' };
  if (value.some((x) => typeof x === 'string' && x.startsWith('enc:'))) return { action: 'fail' }; // mixed
  if (!value.every((x) => typeof x === 'string' && CODE.test(x))) return { action: 'fail' };
  const cipher = await encryptValue('access_audit_findings', 'signals', OWNER, SYSTEM_ROW, value);
  if (!Array.isArray(cipher) || cipher.length !== value.length || cipher.some((x) => typeof x !== 'string' || !x.startsWith('enc:v2:'))) return { action: 'fail' };
  let back: unknown;
  try {
    back = await decryptValue('access_audit_findings', 'signals', OWNER, SYSTEM_ROW, cipher);
  } catch {
    return { action: 'fail' };
  }
  if (!Array.isArray(back) || back.length !== value.length || back.some((x, i) => x !== value[i])) return { action: 'fail' };
  return { action: 'write', ciphertext: cipher as string[] };
}

export async function runSignalsBatch(
  rows: readonly SignalsRow[],
  write: (patch: SignalsWrite) => Promise<void>,
  apply: boolean,
): Promise<SignalsBatchResult> {
  const slice = rows.slice(0, SIGNALS_BATCH);
  const result: SignalsBatchResult = { examined: slice.length, skipped: 0, planned: 0, written: 0, failed: 0, aborted: rows.length > SIGNALS_BATCH };
  const writes: SignalsWrite[] = [];
  for (const row of slice) {
    if (!row.id) { result.failed += 1; result.aborted = true; return result; }
    const plan = await planSignals(row.signals);
    if (plan.action === 'fail') { result.failed += 1; result.aborted = true; return result; }
    if (plan.action === 'skip') result.skipped += 1;
    else { result.planned += 1; writes.push({ id: row.id, ciphertext: plan.ciphertext, previous: row.signals as string[] }); }
  }
  if (!apply) return result;
  for (const patch of writes) { await write(patch); result.written += 1; }
  return result;
}
