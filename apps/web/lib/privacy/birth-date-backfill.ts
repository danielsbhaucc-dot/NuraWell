/**
 * המרה הדרגתית של תאריך לידה גלוי (ISO) ל-enc:v2.
 *
 * הקוראים כבר מקבלים מחרוזת: הטופס בודק גיל לפני השמירה, ההסכמה שומרת מספר גיל
 * ולא את התאריך, ואין מיון או סינון SQL על העמודות. קריאה כפולה משאירה ISO
 * גלוי קריא עד ההמרה. enc:v2 קיים לא נדרס. פענוח חייב להחזיר את אותו התאריך
 * לפני כתיבה. כישלון סוגר את המנה בלי כתיבה. אין לוג של הערך.
 *
 * לא מוחקים עמודות, גיבויים או מקורות. לא מריצים על מארח מתוך המודול.
 */
import { decryptValue, sealRow } from '@/lib/security/field-crypto';

export const BIRTH_BATCH = 25;
export const BIRTH_COLUMNS = ['date_of_birth', 'birth_date'] as const;
export type BirthColumn = (typeof BIRTH_COLUMNS)[number];

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export type BirthRow = { id: string; date_of_birth?: unknown; birth_date?: unknown };
export type BirthWrite = { id: string; column: BirthColumn; ciphertext: string };

export type BirthPlan =
  | { action: 'skip' }
  | { action: 'write'; ciphertext: string }
  | { action: 'fail' };

export type BirthRestore =
  | { action: 'skip' }
  | { action: 'restore'; plain: string }
  | { action: 'fail' };

export type BirthBatchResult = {
  examined: number;
  skipped: number;
  planned: number;
  written: number;
  failed: number;
  aborted: boolean;
};

function isColumn(column: string): column is BirthColumn {
  return (BIRTH_COLUMNS as readonly string[]).includes(column);
}

export async function planBirthValue(column: string, value: unknown, userId: string, rowId: string): Promise<BirthPlan> {
  if (!isColumn(column) || !userId || !rowId) return { action: 'fail' };
  if (value === null || value === undefined || value === '') return { action: 'skip' };
  if (typeof value !== 'string') return { action: 'fail' };
  if (value.startsWith('enc:v2:')) return { action: 'skip' };
  if (!ISO.test(value)) return { action: 'fail' };
  const sealed = await sealRow('profiles', userId, rowId, { [column]: value });
  const cipher = sealed[column];
  if (typeof cipher !== 'string' || !cipher.startsWith('enc:v2:') || cipher.includes(value)) return { action: 'fail' };
  let opened: unknown;
  try {
    opened = await decryptValue('profiles', column, userId, rowId, cipher);
  } catch {
    return { action: 'fail' };
  }
  if (opened !== value) return { action: 'fail' };
  return { action: 'write', ciphertext: cipher };
}

export async function planBirthRestore(column: string, value: unknown, userId: string, rowId: string): Promise<BirthRestore> {
  if (!isColumn(column) || !userId || !rowId) return { action: 'fail' };
  if (value === null || value === undefined || value === '') return { action: 'skip' };
  if (typeof value !== 'string') return { action: 'fail' };
  if (ISO.test(value)) return { action: 'skip' };
  if (!value.startsWith('enc:v2:')) return { action: 'fail' };
  let opened: unknown;
  try {
    opened = await decryptValue('profiles', column, userId, rowId, value);
  } catch {
    return { action: 'fail' };
  }
  if (typeof opened !== 'string' || !ISO.test(opened)) return { action: 'fail' };
  return { action: 'restore', plain: opened };
}

export async function runBirthBatch(
  rows: readonly BirthRow[],
  write: (patch: BirthWrite) => Promise<void>,
  apply: boolean,
): Promise<BirthBatchResult> {
  const slice = rows.slice(0, BIRTH_BATCH);
  const result: BirthBatchResult = { examined: slice.length, skipped: 0, planned: 0, written: 0, failed: 0, aborted: rows.length > BIRTH_BATCH };
  const writes: BirthWrite[] = [];
  for (const row of slice) {
    if (!row.id) {
      result.failed += 1;
      result.aborted = true;
      return result;
    }
    for (const column of BIRTH_COLUMNS) {
      const plan = await planBirthValue(column, row[column], row.id, row.id);
      if (plan.action === 'fail') {
        result.failed += 1;
        result.aborted = true;
        return result;
      }
      if (plan.action === 'skip') result.skipped += 1;
      else {
        result.planned += 1;
        writes.push({ id: row.id, column, ciphertext: plan.ciphertext });
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
