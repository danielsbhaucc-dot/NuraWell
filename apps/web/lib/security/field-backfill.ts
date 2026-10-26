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
import { decryptString, isEncrypted } from '@/lib/crypto/pii';
import { createRawAdminClient } from '@/lib/supabase/admin';
import { decryptValue, encryptValue, isV2 } from '@/lib/security/field-crypto';
import { BLIND_INDEX_COLUMNS, BLIND_INDEX_SOURCES, blindIndexPatch } from '@/lib/security/blind-index';
import { APPEND_ONLY_TABLES, encryptedTable, FIELD_V2_TABLES, isBlocked, keyColumns, ownerOf, rowKeyOf } from '@/lib/security/field-registry';

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

export async function backfillFieldV2(budgetMs = 30_000, tables: readonly string[] = FIELD_V2_BACKFILL_TABLES) {
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
        const { data: upd, error: uErr } = await u.select(keyCols.join(','));
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
