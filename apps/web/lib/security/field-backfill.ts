/**
 * Staged enc:v2 backfill (per-user field envelope). Runs from the master cron, time-boxed and idempotent.
 * Only tables in FIELD_V2_BACKFILL_TABLES are touched, only registered and non-BLOCKED columns.
 *
 * Per row: plaintext/enc:v1 -> plain value -> enc:v2 (AAD table:column:row under the owner's DEK)
 *   - round-trip verified in memory before writing,
 *   - written with an optimistic-concurrency guard (updated_at must be unchanged, else the row is skipped
 *     and retried next run, so a concurrent user write is never overwritten),
 *   - re-read from the DB and SHA-256 of the decrypted value compared with SHA-256 of the original plain.
 * Never logs values; only counts.
 */
import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { decryptString, isEncrypted } from '@/lib/crypto/pii';
import { createRawAdminClient } from '@/lib/supabase/admin';
import { publicKeyPem, verifyChain } from '@/lib/legal/evidence-crypto';
import { decryptValue, encryptValue, isV2 } from '@/lib/security/field-crypto';
import { BLIND_INDEX_COLUMNS, BLIND_INDEX_SOURCES, blindIndexPatch } from '@/lib/security/blind-index';
import { FUZZY_THRESHOLD, matchesAnyWord, receiptSearchText } from '@/lib/legal/media/receipts-core';
import { fuzzyReceipts, searchReceiptIds } from '@/lib/legal/media/receipts';
import { SYSTEM_ROW, APPEND_ONLY_TABLES, encryptedTable, FIELD_V2_TABLES, isBlocked, keyColumns, ownerOf, rowKeyOf } from '@/lib/security/field-registry';

/** staged rollout list (defined in field-registry so the write path can read it without a cycle) */
// append-only evidence tables reject UPDATE by design: only rows written after go-live are encrypted (see APPEND_ONLY_TABLES)
export const FIELD_V2_BACKFILL_TABLES: readonly string[] = FIELD_V2_TABLES.filter((t) => !(t in APPEND_ONLY_TABLES));

const CAS_MAX = 2000;

/** CAS filter on a stored value: text by equality, json by jsonb equality, text[] by array equality. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- PostgREST builder
export function casEq(u: any, kind: string, col: string, stored: unknown): any {
  if (kind === 'text') return u.eq(col, String(stored));
  if (kind === 'text[]') return u.eq(col, `{${(stored as unknown[]).map((x) => JSON.stringify(String(x))).join(',')}}`);
  return u.eq(col, JSON.stringify(stored));
}

const canon = (v: unknown) => createHash('sha256').update(JSON.stringify(v ?? null)).digest('hex');

function legacyPlain(kind: string, v: unknown, userId: string): unknown {
  if (kind === 'text[]' && Array.isArray(v)) return v.map((x) => (isEncrypted(x) ? decryptString(x, userId) : x));
  if (!isEncrypted(v)) return v;
  const s = decryptString(v, userId);
  return kind === 'text' ? s : JSON.parse(s);
}

const needs = (v: unknown) =>
  v !== null && v !== undefined && v !== '' && !(isV2(v) || (Array.isArray(v) && (v.length === 0 || v.every(isV2))));

/** `only`: restrict the scan to rows where `col = value` (e.g. one user's fresh auth_session_trail rows). */
export async function backfillFieldV2(
  budgetMs = 30_000,
  tables: readonly string[] = FIELD_V2_BACKFILL_TABLES,
  only?: { col: string; value: string },
) {
  const db = createRawAdminClient();
  const deadline = Date.now() + budgetMs;
  const out: Record<string, { rows: number; skippedRace: number; verifyFail: number; remaining?: number; error?: string }> = {};
  for (const table of tables) {
   try {
    const spec = encryptedTable(table);
    if (!spec) continue;
    const cols = Object.keys(spec.columns).filter((c) => !isBlocked(table, c));
    const stat = (out[table] = { rows: 0, skippedRace: 0, verifyFail: 0 });
    const keyCols = keyColumns(spec);
    const guardCols = [...(spec.guardCols ?? ['updated_at'])];
    // owner-optional tables: shared (owner NULL) rows stay plaintext but still need their blind index (dedupe keys)
    const sharedBidx = spec.ownerOptional ? [...(BLIND_INDEX_COLUMNS[table] ?? [])] : [];
    const selectCols = [...new Set([...keyCols, ...guardCols, ...cols, ...sharedBidx])].join(',');
    const composite = Boolean(spec.rowCols);
    let after: string | null = null;
    let offset = 0;
    while (Date.now() < deadline) {
      let q = db.from(table).select(selectCols);
      if (only) q = q.eq(only.col, only.value);
      if (composite) {
        // composite key: stable order over all key columns, offset paging (rows never leave the set)
        for (const c of keyCols) q = q.order(c);
        q = q.range(offset, offset + 49);
      } else {
        q = q.order(spec.rowCol).limit(50);
        if (after) q = q.gt(spec.rowCol, after);
      }
      const { data, error } = await q;
      if (error) throw new Error(`${table}: ${error.code ?? error.message}`);
      const rows = (data ?? []) as unknown as Record<string, unknown>[];
      if (!rows.length) break;
      after = String(rows[rows.length - 1][spec.rowCol]);
      offset += rows.length;
      for (const r of rows) {
        if (Date.now() >= deadline) break;
        const userId = ownerOf(spec, r);
        const rowId = rowKeyOf(spec, r);
        if (rowId && !userId && sharedBidx.length && sharedBidx.some((c) => r[c] == null)) {
          const bi = await blindIndexPatch(table, r);
          const set = Object.fromEntries(Object.entries(bi).filter(([k, v]) => v != null && r[k] == null));
          if (Object.keys(set).length) {
            const { error: sErr } = await db.from(table).update(set).eq(spec.rowCol, r[spec.rowCol] as string).is(spec.userCol, null);
            if (sErr) throw new Error(`${table} shared bidx: ${sErr.code ?? sErr.message}`);
            stat.rows++;
          }
          continue;
        }
        if (!rowId || !userId) continue;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- PostgREST builder types recurse too deep here
        const byKey = (qq: any): any => {
          let x = qq;
          for (const c of keyCols) x = x.eq(c, r[c]);
          return x;
        };
        const patch: Record<string, unknown> = {};
        const hashes: Record<string, string> = {};
        for (const c of cols) {
          if (!needs(r[c])) continue;
          const plain = legacyPlain(spec.columns[c], r[c], userId);
          const enc = await encryptValue(table, c, userId, rowId, plain);
          if (canon(await decryptValue(table, c, userId, rowId, enc)) !== canon(plain)) throw new Error(`${table}.${c}: round-trip mismatch`);
          patch[c] = enc;
          hashes[c] = canon(plain);
        }
        if (!Object.keys(patch).length) continue;
        // blind-index columns (migration 000208) are filled from the same plaintext in the same CAS update
        if (BLIND_INDEX_SOURCES[table]?.some((c) => c in patch)) {
          const plainRow: Record<string, unknown> = { ...r };
          for (const c of Object.keys(patch)) plainRow[c] = legacyPlain(spec.columns[c], r[c], userId);
          for (const c of BLIND_INDEX_SOURCES[table]) if (!(c in patch)) delete plainRow[c];
          Object.assign(patch, await blindIndexPatch(table, plainRow));
        }
        let u = byKey(db.from(table).update(patch));
        for (const g of guardCols) u = r[g] == null ? u.is(g, null) : u.eq(g, r[g] as string);
        // no updated_at (guardCols: []): compare-and-swap on the exact stored values being replaced
        // (values too long for a URL filter skip the CAS; the re-read verification below still runs)
        if (!guardCols.length && Object.keys(hashes).every((c) => JSON.stringify(r[c]).length <= CAS_MAX))
          for (const c of Object.keys(hashes)) u = casEq(u, spec.columns[c], c, r[c]);
        let { data: upd, error: uErr } = await u.select(keyCols.join(','));
        // historical duplicate notifications (written before the unique scope covered them) collide on
        // meta_unique_bidx: the first row keeps the index, later duplicates are sealed without it
        if (uErr?.code === '23505' && table === 'notifications' && patch.meta_unique_bidx != null) {
          delete patch.meta_unique_bidx;
          let u2 = byKey(db.from(table).update(patch));
          for (const g of guardCols) u2 = r[g] == null ? u2.is(g, null) : u2.eq(g, r[g] as string);
          if (!guardCols.length && Object.keys(hashes).every((c) => JSON.stringify(r[c]).length <= CAS_MAX))
            for (const c of Object.keys(hashes)) u2 = casEq(u2, spec.columns[c], c, r[c]);
          ({ data: upd, error: uErr } = await u2.select(keyCols.join(',')));
        }
        if (uErr) throw new Error(`${table} update: ${uErr.code ?? uErr.message}`);
        if (!upd?.length) {
          stat.skippedRace++;
          continue;
        }
        const { data: back, error: bErr } = await byKey(db.from(table).select(Object.keys(hashes).join(','))).single();
        if (bErr || !back) throw new Error(`${table} verify read: ${bErr?.code ?? 'missing'}`);
        for (const c of Object.keys(hashes)) {
          const v = (back as unknown as Record<string, unknown>)[c];
          if (canon(await decryptValue(table, c, userId, rowId, v)) !== hashes[c]) stat.verifyFail++;
        }
        stat.rows++;
      }
    }
   } catch (e) {
    // one table failing (schema drift, URL too long, ...) must not stop the others; counts only, no values
    out[table] = { ...(out[table] ?? { rows: 0, skippedRace: 0, verifyFail: 0 }), error: e instanceof Error ? e.message.slice(0, 200) : 'error' };
   }
  }
  return out;
}

/** Persist a counts-only summary of a run (best effort; never throws). */
export async function recordBackfillRun(source: 'vercel_cron' | 'master' | 'manual', durationMs: number, result: unknown) {
  try {
    await createRawAdminClient().from('field_backfill_runs').insert({ source, duration_ms: durationMs, result: result as never });
  } catch {
    /* ignore */
  }
}

// ---- last three encrypted columns (000222/000224) ----
/**
 * Maintenance for the last three encrypted columns (000222/000224). Every function returns counts only.
 *  - resealAuditLog: one-time, documented reseal of historical plaintext iam_audit_log rows (checkpoint row first,
 *    hash and links untouched, rows marked hash_input='plain_v1'); see iam_audit_reseal_apply.
 *  - verifyAuditLog: chain links + stored hashes in SQL, plus plain_v1 hashes recomputed from decrypted values.
 *  - receiptSearchParity: before search_text is dropped, compares the legacy SQL search (search_text) with the new
 *    app search on the same queries generated from the receipts themselves.
 */


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

// ---- 000225: one-time reseal of legacy plaintext legal evidence (counts only) ----
/**
 * legalReseal: plaintext cells of consent_evidence / consent_evidence_attestations / legal_access_log -> enc:v2.
 *  1. digest (sha256 of canonical JSON) of every row of the three tables as the app reads them (decrypting client),
 *     plus verifyChain per user;
 *  2. encrypt each plaintext cell and verify the round-trip in memory;
 *  3. legal_reseal_apply records sha256 of each original value in legal_reseal_checkpoint, then swaps the cell;
 *  4. digests and chains are recomputed and must be identical; legal_reseal_check re-hashes decrypted values.
 * Nothing evidentiary changes: record_hash/prev_hash/signature are not touched (they cover the plaintext).
 */
const LEGAL_TABLES = ['consent_evidence', 'consent_evidence_attestations', 'legal_access_log'] as const;
const canonJson = (v: unknown): string =>
  v === null || typeof v !== 'object'
    ? JSON.stringify(v ?? null)
    : Array.isArray(v)
      ? `[${v.map(canonJson).join(',')}]`
      : `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${canonJson((v as Record<string, unknown>)[k])}`).join(',')}}`;
const sha256Of = (s: string) => createHash('sha256').update(s).digest('hex');

async function legalSnapshot(db: SupabaseClient): Promise<{ digest: Record<string, string>; rows: number; chainsOk: number; chainsBad: number }> {
  const digest: Record<string, string> = {};
  let rows = 0;
  for (const t of LEGAL_TABLES) {
    const { data, error } = await db.from(t).select('*').order('id');
    if (error) throw new Error(`read_${t}`);
    rows += (data ?? []).length;
    digest[t] = sha256Of(canonJson(data ?? []));
  }
  const { data: recs } = await db.from('consent_evidence').select('*').order('created_at').order('id');
  const byUser = new Map<string, unknown[]>();
  for (const r of (recs ?? []) as Array<{ user_id: string }>) byUser.set(r.user_id, [...(byUser.get(r.user_id) ?? []), r]);
  let chainsOk = 0;
  let chainsBad = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- StoredRecord shape is the row shape
  for (const list of byUser.values()) (verifyChain(list as any, publicKeyPem()).ok ? chainsOk++ : chainsBad++);
  return { digest, rows, chainsOk, chainsBad };
}

type Cell = { t: string; id: string; col: string };
async function unsealed(raw: SupabaseClient): Promise<Cell[]> {
  const { data, error } = await raw.rpc('legal_unsealed');
  if (error) throw new Error('list_failed');
  return (data ?? []) as Cell[];
}

export async function legalVerify(db: SupabaseClient, raw: SupabaseClient) {
  const snap = await legalSnapshot(db);
  const { data: cps } = await raw.from('legal_reseal_checkpoint').select('table_name, row_id, col').neq('row_id', '*');
  const items = [];
  for (const c of (cps ?? []) as Array<{ table_name: string; row_id: string; col: string }>) {
    const { data } = await db.from(c.table_name).select(c.col).eq('id', c.row_id).maybeSingle();
    items.push({ t: c.table_name, id: c.row_id, col: c.col, value: data ? (data as Record<string, unknown>)[c.col] : null });
  }
  const { data: check } = items.length ? await raw.rpc('legal_reseal_check', { p: items }) : { data: { checked: 0, mismatch: 0, missing: 0 } };
  return { rows: snap.rows, chainsOk: snap.chainsOk, chainsBad: snap.chainsBad, unsealed: (await unsealed(raw)).length, checkpoint: check, digest: snap.digest };
}

export async function legalReseal(db: SupabaseClient, raw: SupabaseClient) {
  const before = await legalSnapshot(db);
  if (before.chainsBad) return { error: 'chain_bad_before', before: { rows: before.rows, chainsBad: before.chainsBad } };
  const cells = await unsealed(raw);
  const p = [];
  for (const c of cells) {
    const spec = encryptedTable(c.t)!;
    const { data, error } = await raw.from(c.t).select(`id, ${c.col}`).eq('id', c.id).single();
    if (error || !data) return { error: 'read_failed', candidates: cells.length };
    const plain = (data as Record<string, unknown>)[c.col];
    const owner = ownerOf(spec, data as Record<string, unknown>)!;
    const cipher = await encryptValue(c.t, c.col, owner, SYSTEM_ROW, plain);
    if (!isV2(cipher) || canonJson(await decryptValue(c.t, c.col, owner, SYSTEM_ROW, cipher)) !== canonJson(plain)) return { error: 'roundtrip_failed', candidates: cells.length };
    p.push({ ...c, cipher });
  }
  const { data: n, error: e } = p.length ? await raw.rpc('legal_reseal_apply', { p }) : { data: 0, error: null };
  if (e) return { error: 'apply_failed', candidates: cells.length };
  const after = await legalVerify(db, raw);
  const identical = LEGAL_TABLES.every((t) => before.digest[t] === after.digest[t]);
  return { candidates: cells.length, resealed: Number(n), identical, before: { rows: before.rows, chainsOk: before.chainsOk }, after: { ...after, digest: undefined } };
}

/**
 * Rolled-back proof for media_receipts enforcement: the real write path (sealing client) builds an insert and an
 * update; the sealed bodies are captured instead of sent and replayed inside media_receipts_write_probe, which turns
 * enforcement on, writes, and rolls everything back. Returns 'accepted' or the rejection message.
 */
export async function mediaReceiptsProbe(raw: SupabaseClient) {
  const { withFieldDecryption } = await import('@/lib/security/field-fetch');
  const { createClient } = await import('@supabase/supabase-js');
  const bodies: Record<string, unknown> = {};
  const capture: typeof fetch = async (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes('/rest/v1/media_receipts') && init?.method && init.method !== 'GET') {
      bodies[init.method] = JSON.parse(String(init.body));
      return new Response(init.method === 'POST' ? '[{}]' : '[]', { status: 201, headers: { 'content-type': 'application/json' } });
    }
    return fetch(input, init);
  };
  const sealed = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
    global: { fetch: withFieldDecryption(capture) },
  });
  const { data: u } = await raw.from('media_receipts').select('user_id').limit(1).maybeSingle();
  const row = {
    user_id: (u as { user_id?: string } | null)?.user_id,
    source: 'upload',
    subject: 'probe subject',
    original_from: 'probe@example.invalid',
    confirmation_code: 'PROBE-1',
    confirmation_link: 'https://example.invalid/probe',
    attachments: [{ name: 'probe.pdf' }],
  };
  await sealed.from('media_receipts').insert(row);
  await sealed.from('media_receipts').update({ confirmation_code: 'PROBE-2', confirmation_link: 'https://example.invalid/p2' }).eq('id', '00000000-0000-0000-0000-000000000000');
  const ins = Array.isArray(bodies.POST) ? bodies.POST[0] : bodies.POST;
  if (!ins || !bodies.PATCH) return { result: 'not_captured', captured: Object.keys(bodies) };
  const allSealed = ['subject', 'original_from', 'confirmation_code', 'confirmation_link', 'attachments'].every((k) => isV2((ins as Record<string, unknown>)[k]));
  const { data, error } = await raw.rpc('media_receipts_write_probe', { p_row: ins, p_update: bodies.PATCH });
  return { result: error ? 'rpc_failed' : data, allSealed };
}
