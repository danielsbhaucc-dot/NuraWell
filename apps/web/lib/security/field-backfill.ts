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
import { encryptedTable, isBlocked } from '@/lib/security/field-registry';

/** staged rollout list — a table is added only after its blocker-fix PR is merged and verified on prod */
export const FIELD_V2_BACKFILL_TABLES: readonly string[] = ['user_memory_dossier'];

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
  const out: Record<string, { rows: number; skippedRace: number; verifyFail: number; remaining?: number }> = {};
  for (const table of tables) {
    const spec = encryptedTable(table);
    if (!spec) continue;
    const cols = Object.keys(spec.columns).filter((c) => !isBlocked(table, c));
    const stat = (out[table] = { rows: 0, skippedRace: 0, verifyFail: 0 });
    const keyCols = [...new Set([spec.userCol, spec.rowCol])];
    let after: string | null = null;
    while (Date.now() < deadline) {
      let q = db.from(table).select([...keyCols, 'updated_at', ...cols].join(',')).order(spec.rowCol).limit(50);
      if (after) q = q.gt(spec.rowCol, after);
      const { data, error } = await q;
      if (error) throw new Error(`${table}: ${error.code ?? error.message}`);
      const rows = (data ?? []) as unknown as Record<string, unknown>[];
      if (!rows.length) break;
      after = String(rows[rows.length - 1][spec.rowCol]);
      for (const r of rows) {
        if (Date.now() >= deadline) break;
        const userId = String(r[spec.userCol]);
        const rowId = String(r[spec.rowCol]);
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
        let u = db.from(table).update(patch).eq(spec.rowCol, rowId);
        u = r.updated_at == null ? u.is('updated_at', null) : u.eq('updated_at', r.updated_at as string);
        const { data: upd, error: uErr } = await u.select(keyCols.join(','));
        if (uErr) throw new Error(`${table} update: ${uErr.code ?? uErr.message}`);
        if (!upd?.length) {
          stat.skippedRace++;
          continue;
        }
        const { data: back, error: bErr } = await db.from(table).select(Object.keys(patch).join(',')).eq(spec.rowCol, rowId).single();
        if (bErr || !back) throw new Error(`${table} verify read: ${bErr?.code ?? 'missing'}`);
        for (const c of Object.keys(patch)) {
          const v = (back as unknown as Record<string, unknown>)[c];
          if (canon(await decryptValue(table, c, userId, rowId, v)) !== hashes[c]) stat.verifyFail++;
        }
        stat.rows++;
      }
    }
  }
  return out;
}
