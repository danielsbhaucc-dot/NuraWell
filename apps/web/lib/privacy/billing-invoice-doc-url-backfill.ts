/**
 * Local legacy backfill: billing_invoices.doc_url → enc:v2 under owner DEK.
 * Idempotent. Conditional UPDATE. Abort on seal/roundtrip failure. No provider HTTP.
 */
import { decryptValue } from '@/lib/security/field-crypto';
import { sealInvoiceDocUrl } from '@/lib/billing/invoice-doc-url';

export type InvoiceDocRow = { id: string; user_id: string; doc_url: string };
export type InvoiceDocPlan =
  | { action: 'skip' }
  | { action: 'write'; sealed: string; previous: string }
  | { action: 'fail'; reason: string };

export async function planInvoiceDocUrl(row: InvoiceDocRow): Promise<InvoiceDocPlan> {
  if (!row.id || !row.user_id) return { action: 'fail', reason: 'missing_id_or_user' };
  if (!row.doc_url) return { action: 'skip' };
  if (row.doc_url.startsWith('enc:v2:')) return { action: 'skip' };
  if (row.doc_url.startsWith('enc:')) return { action: 'fail', reason: 'unsupported_enc' };
  if (!/^https?:\/\//i.test(row.doc_url.trim())) return { action: 'fail', reason: 'not_http_url' };
  let sealed: string;
  try {
    sealed = await sealInvoiceDocUrl(row.user_id, row.id, row.doc_url);
  } catch {
    return { action: 'fail', reason: 'seal_or_key' };
  }
  let back: unknown;
  try {
    back = await decryptValue('billing_invoices', 'doc_url', row.user_id, row.id, sealed);
  } catch {
    return { action: 'fail', reason: 'decrypt' };
  }
  if (back !== row.doc_url.trim()) return { action: 'fail', reason: 'roundtrip' };
  return { action: 'write', sealed, previous: row.doc_url };
}

export async function runBillingInvoiceDocUrlBackfill(
  rows: readonly InvoiceDocRow[],
  write: (id: string, sealed: string, previous: string) => Promise<boolean>,
  apply: boolean,
) {
  const result = { examined: 0, skipped: 0, planned: 0, written: 0, failed: 0, aborted: false };
  const writes: { id: string; sealed: string; previous: string }[] = [];
  for (const row of rows) {
    result.examined += 1;
    const plan = await planInvoiceDocUrl(row);
    if (plan.action === 'fail') { result.failed += 1; result.aborted = true; return result; }
    if (plan.action === 'skip') result.skipped += 1;
    else { result.planned += 1; writes.push({ id: row.id, sealed: plan.sealed, previous: plan.previous }); }
  }
  if (!apply) return result;
  for (const w of writes) {
    if (!(await write(w.id, w.sealed, w.previous))) { result.failed += 1; result.aborted = true; return result; }
    result.written += 1;
  }
  return result;
}
