/**
 * Maintenance for the last three encrypted columns (000222/000224). Every function returns counts only.
 *  - resealAuditLog: one-time, documented reseal of historical plaintext iam_audit_log rows (checkpoint row first,
 *    hash and links untouched, rows marked hash_input='plain_v1'); see iam_audit_reseal_apply.
 *  - verifyAuditLog: chain links + stored hashes in SQL, plus plain_v1 hashes recomputed from decrypted values.
 *  - receiptSearchParity: before search_text is dropped, compares the legacy SQL search (search_text) with the new
 *    app search on the same queries generated from the receipts themselves.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { decryptValue, encryptValue } from '@/lib/security/field-crypto';
import { SYSTEM_ROW } from '@/lib/security/field-registry';
import { FUZZY_THRESHOLD, receiptSearchText, searchReceiptIds, fuzzyReceipts, matchesAnyWord } from '@/lib/legal/media/receipt-search';

const OWNER = 'system:audit';
type AuditRow = { seq: number; target: string | null; detail: unknown };

export async function resealAuditLog(raw: SupabaseClient): Promise<{ candidates: number; resealed: number; error?: string }> {
  const { data: seqs, error: e1 } = await raw.rpc('iam_audit_unsealed');
  if (e1) return { candidates: 0, resealed: 0, error: 'list_failed' };
  const ids = ((seqs ?? []) as Array<number | { iam_audit_unsealed: number }>).map((x) => (typeof x === 'number' ? x : x.iam_audit_unsealed));
  if (!ids.length) return { candidates: 0, resealed: 0 };
  const { data, error: e2 } = await raw.from('iam_audit_log').select('seq, target, detail').in('seq', ids);
  if (e2 || !data || data.length !== ids.length) return { candidates: ids.length, resealed: 0, error: 'read_failed' };
  const p = [];
  for (const r of data as AuditRow[]) {
    p.push({
      seq: r.seq,
      plain_target: r.target,
      plain_detail: r.detail,
      enc_target: r.target == null ? null : await encryptValue('iam_audit_log', 'target', OWNER, SYSTEM_ROW, r.target),
      enc_detail: await encryptValue('iam_audit_log', 'detail', OWNER, SYSTEM_ROW, r.detail ?? {}),
    });
  }
  const { data: n, error: e3 } = await raw.rpc('iam_audit_reseal_apply', { p });
  if (e3) return { candidates: ids.length, resealed: 0, error: 'apply_failed' };
  return { candidates: ids.length, resealed: Number(n) };
}

export async function verifyAuditLog(raw: SupabaseClient): Promise<{ firstBadSeq: number | null; plainV1: number; plainV1Mismatch: number; unsealed: number }> {
  const { data: bad } = await raw.rpc('iam_audit_verify');
  const { data } = await raw.from('iam_audit_log').select('seq, target, detail').eq('hash_input', 'plain_v1').order('seq');
  const rows = (data ?? []) as AuditRow[];
  const p = [];
  for (const r of rows) {
    p.push({
      seq: r.seq,
      target: await decryptValue('iam_audit_log', 'target', OWNER, SYSTEM_ROW, r.target),
      detail: await decryptValue('iam_audit_log', 'detail', OWNER, SYSTEM_ROW, r.detail),
    });
  }
  const { data: mism } = p.length ? await raw.rpc('iam_audit_hash_check', { p }) : { data: 0 };
  const { data: left } = await raw.rpc('iam_audit_unsealed');
  return { firstBadSeq: bad == null ? null : Number(bad), plainV1: rows.length, plainV1Mismatch: Number(mism ?? -1), unsealed: ((left ?? []) as unknown[]).length };
}

type Rec = { id: string; vendor: unknown; plan: unknown; subject: unknown; currency: unknown; amount: unknown; search_text?: string | null };
const same = (a: string[], b: string[]) => a.length === b.length && [...a].sort().every((x, i) => x === [...b].sort()[i]);

/**
 * db = decrypting client. Legacy search_text has the subject as ciphertext, so the legacy result is compared with the
 * new predicate on the subject-less text (exact parity); the new full search must contain it (superset: subjects
 * become searchable). The token prefilter must never drop a row the exact predicate accepts.
 */
export async function receiptSearchParity(db: SupabaseClient): Promise<Record<string, number>> {
  const { data } = await db.from('media_receipts').select('id, vendor, plan, subject, currency, amount, search_text').order('id');
  const rows = (data ?? []) as Rec[];
  const qs = new Set<string>();
  for (const r of rows) {
    for (const v of [r.vendor, r.plan, r.currency]) {
      const w = String(v ?? '').toLowerCase().trim();
      if (!w) continue;
      qs.add(w);
      if ([...w].length > 3) { qs.add([...w].slice(0, 3).join('')); qs.add(w.slice(0, -1) + 'x'); }
    }
  }
  qs.add('zzqqxx-none');
  const noSubj = (r: Rec) => receiptSearchText({ ...r, subject: null });
  const out = { queries: qs.size, substringLegacyEqual: 0, substringNewSuperset: 0, prefilterExact: 0, fuzzyLegacyEqual: 0, mismatches: 0 };
  for (const q of qs) {
    const legacy = rows.filter((r) => (r.search_text ?? '').includes(q)).map((r) => r.id);
    const plainNoSubj = rows.filter((r) => matchesAnyWord(noSubj(r), [q])).map((r) => r.id);
    const exactFull = rows.filter((r) => matchesAnyWord(receiptSearchText(r), [q])).map((r) => r.id);
    const viaIndex = await searchReceiptIds(db, [q], 2000);
    const a = same(legacy, plainNoSubj); const b = plainNoSubj.every((x) => viaIndex.includes(x)); const c = same(viaIndex, exactFull);
    let d = true;
    if ([...q].length >= 3) {
      const { data: lf } = await db.rpc('legal_hub_fuzzy', { p_q: q, p_limit: 100 });
      const legacyF = ((lf ?? []) as Array<{ kind: string; id: string }>).filter((x) => x.kind === 'receipt').map((x) => x.id);
      const { data: sims } = await db.rpc('legal_word_similarity', { p_q: q, p_texts: rows.map(noSubj) });
      const ns = rows.filter((r, i) => Number((sims as number[] | null)?.[i] ?? 0) >= FUZZY_THRESHOLD || noSubj(r).includes(q)).map((r) => r.id);
      const full = (await fuzzyReceipts(db, q, 100)).map((x) => x.id);
      d = same(legacyF, ns) && ns.every((x) => full.includes(x));
    }
    out.substringLegacyEqual += +a; out.substringNewSuperset += +b; out.prefilterExact += +c; out.fuzzyLegacyEqual += +d;
    if (!(a && b && c && d)) out.mismatches++;
  }
  return out;
}
