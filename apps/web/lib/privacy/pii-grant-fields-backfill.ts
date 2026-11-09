/**
 * המרה מקומית של pii_access_grants.ticket_ref / country גלויים ל-enc:v2 במפתח audit.
 * מנה של 25. פענוח לפני כתיבה. enc:v2 לא נדרס. אין לוג של הערכים.
 * reason נשאר במסלול backfill הישן (pii-grant-reason-backfill).
 */
import { decryptValue, encryptValue } from '@/lib/security/field-crypto';
import { SYSTEM_ROW } from '@/lib/security/field-registry';
import { COUNTRY_MAX_PLAIN, TICKET_REF_MAX, readableTicketRef, readableCountry } from '@/lib/platform/access/grant-fields';

export const GRANT_FIELDS_BATCH = 25;
const OWNER = 'system:audit';
type Col = 'ticket_ref' | 'country';

export type GrantFieldsRow = { id: string; ticket_ref: unknown; country: unknown };
export type GrantFieldsWrite = { id: string; column: Col; ciphertext: string; previous: string };
export type GrantFieldsPlan = { action: 'skip' } | { action: 'write'; ciphertext: string } | { action: 'fail' };
export type GrantFieldsBatchResult = { examined: number; skipped: number; planned: number; written: number; failed: number; aborted: boolean };

export async function planGrantField(column: Col, value: unknown): Promise<GrantFieldsPlan> {
  if (value === null || value === undefined || value === '') return { action: 'skip' };
  if (typeof value !== 'string') return { action: 'fail' };
  if (value.startsWith('enc:v2:')) return { action: 'skip' };
  if (column === 'ticket_ref') {
    if (!readableTicketRef(value) || [...value].length > TICKET_REF_MAX || !/^[A-Za-z0-9#._-]+$/.test(value)) return { action: 'fail' };
  } else {
    if (!readableCountry(value) || [...value].length > COUNTRY_MAX_PLAIN) return { action: 'fail' };
  }
  const cipher = await encryptValue('pii_access_grants', column, OWNER, SYSTEM_ROW, value);
  if (typeof cipher !== 'string' || !cipher.startsWith('enc:v2:') || cipher.includes(value)) return { action: 'fail' };
  let back: unknown;
  try {
    back = await decryptValue('pii_access_grants', column, OWNER, SYSTEM_ROW, cipher);
  } catch {
    return { action: 'fail' };
  }
  if (back !== value) return { action: 'fail' };
  return { action: 'write', ciphertext: cipher };
}

export async function runGrantFieldsBatch(
  rows: readonly GrantFieldsRow[],
  write: (patch: GrantFieldsWrite) => Promise<void>,
  apply: boolean,
): Promise<GrantFieldsBatchResult> {
  const slice = rows.slice(0, GRANT_FIELDS_BATCH);
  const result: GrantFieldsBatchResult = { examined: slice.length, skipped: 0, planned: 0, written: 0, failed: 0, aborted: rows.length > GRANT_FIELDS_BATCH };
  const writes: GrantFieldsWrite[] = [];
  for (const row of slice) {
    if (!row.id) {
      result.failed += 1;
      result.aborted = true;
      return result;
    }
    for (const column of ['ticket_ref', 'country'] as const) {
      const plan = await planGrantField(column, row[column]);
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
