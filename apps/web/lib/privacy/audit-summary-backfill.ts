/**
 * המרה מקומית של סיכום ממצא גלוי ל-enc:v2 במפתח המערכת audit.
 * מנה של 25. פענוח לפני כתיבה. enc:v2 לא נדרס. אין לוג של הסיכום.
 */
import { decryptValue, encryptValue } from '@/lib/security/field-crypto';
import { SYSTEM_ROW } from '@/lib/security/field-registry';
import { findingTitle, CLOSED_FINDING } from '@/lib/platform/access/finding-title';

export const SUMMARY_BATCH = 25;
const OWNER = 'system:audit';

export type SummaryRow = { id: string; summary: unknown };
export type SummaryWrite = { id: string; ciphertext: string; previous: string };
export type SummaryPlan = { action: 'skip' } | { action: 'write'; ciphertext: string } | { action: 'fail' };
export type SummaryBatchResult = { examined: number; skipped: number; planned: number; written: number; failed: number; aborted: boolean };

export async function planAuditSummary(value: unknown): Promise<SummaryPlan> {
  if (value === null || value === undefined || value === '') return { action: 'skip' };
  if (typeof value !== 'string') return { action: 'fail' };
  if (value.startsWith('enc:v2:')) return { action: 'skip' };
  const opened = findingTitle(value);
  if (opened === CLOSED_FINDING || opened.length > 400) return { action: 'fail' };
  const cipher = await encryptValue('access_audit_findings', 'summary', OWNER, SYSTEM_ROW, opened);
  if (typeof cipher !== 'string' || !cipher.startsWith('enc:v2:') || cipher.includes(opened)) return { action: 'fail' };
  let back: unknown;
  try {
    back = await decryptValue('access_audit_findings', 'summary', OWNER, SYSTEM_ROW, cipher);
  } catch {
    return { action: 'fail' };
  }
  if (back !== opened) return { action: 'fail' };
  return { action: 'write', ciphertext: cipher };
}

export async function runAuditSummaryBatch(
  rows: readonly SummaryRow[],
  write: (patch: SummaryWrite) => Promise<void>,
  apply: boolean,
): Promise<SummaryBatchResult> {
  const slice = rows.slice(0, SUMMARY_BATCH);
  const result: SummaryBatchResult = { examined: slice.length, skipped: 0, planned: 0, written: 0, failed: 0, aborted: rows.length > SUMMARY_BATCH };
  const writes: SummaryWrite[] = [];
  for (const row of slice) {
    if (!row.id) {
      result.failed += 1;
      result.aborted = true;
      return result;
    }
    const plan = await planAuditSummary(row.summary);
    if (plan.action === 'fail') {
      result.failed += 1;
      result.aborted = true;
      return result;
    }
    if (plan.action === 'skip') result.skipped += 1;
    else {
      result.planned += 1;
      writes.push({ id: row.id, ciphertext: plan.ciphertext, previous: row.summary as string });
    }
  }
  if (!apply) return result;
  for (const patch of writes) {
    await write(patch);
    result.written += 1;
  }
  return result;
}
