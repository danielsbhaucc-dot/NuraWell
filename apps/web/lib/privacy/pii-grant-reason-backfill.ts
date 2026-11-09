/**
 * המרה מקומית של נימוק גישה גלוי ל-enc:v2 במפתח המערכת audit.
 * מנה של 25. פענוח לפני כתיבה. enc:v2 לא נדרס. ערך לא קריא סוגר את המנה בלי כתיבה.
 * אין לוג של הנימוק. לא רץ על מארח מתוך המודול.
 */
import { decryptValue, encryptValue } from '@/lib/security/field-crypto';
import { SYSTEM_ROW } from '@/lib/security/field-registry';
import { readableGrantReason } from '@/lib/platform/access/grant-reason';

export const GRANT_REASON_BATCH = 25;
const OWNER = 'system:audit';

export type GrantReasonRow = { id: string; reason: unknown };
export type GrantReasonWrite = { id: string; ciphertext: string; previous: string };
export type GrantReasonPlan = { action: 'skip' } | { action: 'write'; ciphertext: string } | { action: 'fail' };
export type GrantReasonBatchResult = { examined: number; skipped: number; planned: number; written: number; failed: number; aborted: boolean };

export async function planGrantReason(value: unknown): Promise<GrantReasonPlan> {
  if (value === null || value === undefined || value === '') return { action: 'skip' };
  if (typeof value !== 'string') return { action: 'fail' };
  if (value.startsWith('enc:v2:')) return { action: 'skip' };
  if (!readableGrantReason(value) || value.length < 15 || value.length > 500) return { action: 'fail' };
  const cipher = await encryptValue('pii_access_grants', 'reason', OWNER, SYSTEM_ROW, value);
  if (typeof cipher !== 'string' || !cipher.startsWith('enc:v2:') || cipher.includes(value)) return { action: 'fail' };
  let opened: unknown;
  try {
    opened = await decryptValue('pii_access_grants', 'reason', OWNER, SYSTEM_ROW, cipher);
  } catch {
    return { action: 'fail' };
  }
  if (opened !== value) return { action: 'fail' };
  return { action: 'write', ciphertext: cipher };
}

export async function runGrantReasonBatch(
  rows: readonly GrantReasonRow[],
  write: (patch: GrantReasonWrite) => Promise<void>,
  apply: boolean,
): Promise<GrantReasonBatchResult> {
  const slice = rows.slice(0, GRANT_REASON_BATCH);
  const result: GrantReasonBatchResult = { examined: slice.length, skipped: 0, planned: 0, written: 0, failed: 0, aborted: rows.length > GRANT_REASON_BATCH };
  const writes: GrantReasonWrite[] = [];
  for (const row of slice) {
    if (!row.id) {
      result.failed += 1;
      result.aborted = true;
      return result;
    }
    const plan = await planGrantReason(row.reason);
    if (plan.action === 'fail') {
      result.failed += 1;
      result.aborted = true;
      return result;
    }
    if (plan.action === 'skip') result.skipped += 1;
    else {
      result.planned += 1;
      writes.push({ id: row.id, ciphertext: plan.ciphertext, previous: row.reason as string });
    }
  }
  if (!apply) return result;
  for (const patch of writes) {
    await write(patch);
    result.written += 1;
  }
  return result;
}
