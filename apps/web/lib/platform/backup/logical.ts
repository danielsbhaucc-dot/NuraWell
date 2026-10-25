import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Product-agnostic logical DB backup (no pg_dump, runs in a serverless cron).
 * Format (before encryption): gzip(JSON lines). Line 1 = manifest; then one line per table chunk:
 * {"s":schema,"t":table,"rows":[...]}. Restore: decrypt (age, offline key) → gunzip → for each table
 * `insert into s.t select * from jsonb_populate_recordset(null::s.t, rows)` (see scripts/backup/logical-restore.mjs).
 */
export type TableStat = { schema: string; table: string; rows: number; verified: number };
export type DumpResult = { plain: Buffer; tables: TableStat[]; rows: number };

const PAGE = 5000;

export async function logicalDump(db: SupabaseClient, opts: { verify?: boolean; createdAt?: string } = {}): Promise<DumpResult> {
  const { data: list, error } = await db.rpc('ops_backup_tables');
  if (error) throw new Error(`tables: ${error.message}`);
  const lines: string[] = [];
  const tables: TableStat[] = [];
  for (const t of (list ?? []) as { schema_name: string; table_name: string }[]) {
    let off = 0, n = 0, verified = 0;
    for (;;) {
      const { data, error: e } = await db.rpc('ops_backup_table', { p_schema: t.schema_name, p_table: t.table_name, p_offset: off, p_limit: PAGE });
      if (e) throw new Error(`dump ${t.schema_name}.${t.table_name}: ${e.message}`);
      const rows = (data ?? []) as unknown[];
      if (rows.length) {
        lines.push(JSON.stringify({ s: t.schema_name, t: t.table_name, rows }));
        if (opts.verify) {
          const { data: v, error: ve } = await db.rpc('ops_backup_verify', { p_schema: t.schema_name, p_table: t.table_name, p_rows: rows });
          if (ve) throw new Error(`verify ${t.schema_name}.${t.table_name}: ${ve.message}`);
          verified += Number(v ?? 0);
        }
      }
      n += rows.length;
      if (rows.length < PAGE) break;
      off += PAGE;
    }
    tables.push({ schema: t.schema_name, table: t.table_name, rows: n, verified });
  }
  const manifest = { format: 'logical-jsonl-v1', created_at: opts.createdAt ?? new Date().toISOString(), tables: tables.map(({ schema, table, rows }) => ({ schema, table, rows })) };
  const plain = gzipSync(Buffer.from([JSON.stringify(manifest), ...lines].join('\n') + '\n'), { level: 9 });
  return { plain, tables, rows: tables.reduce((a, b) => a + b.rows, 0) };
}

/** age-encrypt to the offline recipient(s); the private key never touches the app. */
export async function ageEncrypt(plain: Uint8Array, recipients: string[]): Promise<Uint8Array> {
  const age = await import('age-encryption');
  const e = new age.Encrypter();
  for (const r of recipients) e.addRecipient(r);
  return e.encrypt(plain);
}

export const sha256 = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
