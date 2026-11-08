/**
 * המרה מקומית של access_audit_runs.error גלוי ל-enc:v2 במפתח audit.
 * מנה של 25. פענוח לפני כתיבה. enc:v2 לא נדרס. אין לוג של הטקסט.
 */
import { decryptValue, encryptValue } from '@/lib/security/field-crypto';
import { SYSTEM_ROW } from '@/lib/security/field-registry';
import { RUN_ERROR_MAX_PLAIN } from '@/lib/platform/access/run-error';

export const RUN_ERROR_BATCH = 25;
const OWNER = 'system:audit';

export type RunErrorRow = { id: string; error: unknown };
export type RunErrorWrite = { id: string; ciphertext: string; previous: string };
export type RunErrorPlan = { action: 'skip' } | { action: 'write'; ciphertext: string } | { action: 'fail' };
export type RunErrorBatchResult = { examined: number; skipped: number; planned: number; written: number; failed: number; aborted: boolean };

export async function planRunError(value: unknown): Promise<RunErrorPlan> {
  if (value === null || value === undefined || value === '') return { action: 'skip' };
  if (typeof value !== 'string') return { action: 'fail' };
  if (value.startsWith('enc:v2:')) return { action: 'skip' };
  if ([...value].length > RUN_ERROR_MAX_PLAIN) return { action: 'fail' };
  const cipher = await encryptValue('access_audit_runs', 'error', OWNER, SYSTEM_ROW, value);
  if (typeof cipher !== 'string' || !cipher.startsWith('enc:v2:') || cipher.includes(value)) return { action: 'fail' };
  let back: unknown;
  try {
    back = await decryptValue('access_audit_runs', 'error', OWNER, SYSTEM_ROW, cipher);
  } catch {
    return { action: 'fail' };
  }
  if (back !== value) return { action: 'fail' };
  return { action: 'write', ciphertext: cipher };
}

export async function runRunErrorBatch(
  rows: readonly RunErrorRow[],
  write: (patch: RunErrorWrite) => Promise<void>,
  apply: boolean,
): Promise<RunErrorBatchResult> {
  const slice = rows.slice(0, RUN_ERROR_BATCH);
  const result: RunErrorBatchResult = { examined: slice.length, skipped: 0, planned: 0, written: 0, failed: 0, aborted: rows.length > RUN_ERROR_BATCH };
  const writes: RunErrorWrite[] = [];
  for (const row of slice) {
    if (!row.id) {
      result.failed += 1;
      result.aborted = true;
      return result;
    }
    const plan = await planRunError(row.error);
    if (plan.action === 'fail') {
      result.failed += 1;
      result.aborted = true;
      return result;
    }
    if (plan.action === 'skip') result.skipped += 1;
    else {
      result.planned += 1;
      writes.push({ id: row.id, ciphertext: plan.ciphertext, previous: row.error as string });
    }
  }
  if (!apply) return result;
  for (const patch of writes) {
    await write(patch);
    result.written += 1;
  }
  return result;
}
