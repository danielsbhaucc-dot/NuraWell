/**
 * המרה מקומית של ops_device_enrollments.label/location גלויים ל-enc:v2 במפתח ops.
 * מנה של 25. פענוח לפני כתיבה. enc:v2 לא נדרס. אין לוג של הטקסט.
 */
import { decryptValue, encryptValue } from '@/lib/security/field-crypto';
import { SYSTEM_ROW } from '@/lib/security/field-registry';
import { ENROLL_FACT_MAX_PLAIN } from '@/lib/ops/enroll-facts';

export const ENROLL_FACT_BATCH = 25;
const OWNER = 'system:ops';
type Col = 'label' | 'location';

export type EnrollFactRow = { id: string; label: unknown; location: unknown };
export type EnrollFactWrite = { id: string; column: Col; ciphertext: string; previous: string };
export type EnrollFactPlan = { action: 'skip' } | { action: 'write'; ciphertext: string } | { action: 'fail' };
export type EnrollFactBatchResult = { examined: number; skipped: number; planned: number; written: number; failed: number; aborted: boolean };

export async function planEnrollFact(column: Col, value: unknown): Promise<EnrollFactPlan> {
  if (value === null || value === undefined || value === '') return { action: 'skip' };
  if (typeof value !== 'string') return { action: 'fail' };
  if (value.startsWith('enc:v2:')) return { action: 'skip' };
  if ([...value].length > ENROLL_FACT_MAX_PLAIN) return { action: 'fail' };
  const cipher = await encryptValue('ops_device_enrollments', column, OWNER, SYSTEM_ROW, value);
  if (typeof cipher !== 'string' || !cipher.startsWith('enc:v2:') || cipher.includes(value)) return { action: 'fail' };
  let back: unknown;
  try {
    back = await decryptValue('ops_device_enrollments', column, OWNER, SYSTEM_ROW, cipher);
  } catch {
    return { action: 'fail' };
  }
  if (back !== value) return { action: 'fail' };
  return { action: 'write', ciphertext: cipher };
}

export async function runEnrollFactsBatch(
  rows: readonly EnrollFactRow[],
  write: (patch: EnrollFactWrite) => Promise<void>,
  apply: boolean,
): Promise<EnrollFactBatchResult> {
  const slice = rows.slice(0, ENROLL_FACT_BATCH);
  const result: EnrollFactBatchResult = { examined: slice.length, skipped: 0, planned: 0, written: 0, failed: 0, aborted: rows.length > ENROLL_FACT_BATCH };
  const writes: EnrollFactWrite[] = [];
  for (const row of slice) {
    if (!row.id) {
      result.failed += 1;
      result.aborted = true;
      return result;
    }
    for (const column of ['label', 'location'] as const) {
      const plan = await planEnrollFact(column, row[column]);
      if (plan.action === 'fail') {
        result.failed += 1;
        result.aborted = true;
        return result;
      }
      if (plan.action === 'skip') result.skipped += 1;
      else {
        result.planned += 1;
        writes.push({ id: row.id, column, ciphertext: plan.ciphertext, previous: row[column] as string });
      }
    }
  }
  if (!apply) return result;
  for (const patch of writes) {
    await write(patch);
    result.written += 1;
  }
  return result;
}
