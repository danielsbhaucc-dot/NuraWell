import type { SupabaseClient } from '@supabase/supabase-js';
import { FREE_DB_LIMIT_BYTES, TABLE_WARN_BYTES, storageLevel, LOG_POLICY } from './policy';

export type StorageStats = {
  db_bytes: number;
  tables: { table: string; bytes: number; rows: number; dead: number; last_autovacuum: string | null }[];
  top: { table: string; bytes: number }[];
};

export type RetentionResult = { dry_run: boolean; tables: Record<string, { class: string; days: number; eligible: number; deleted: number }> };

export async function readStorage(db: SupabaseClient): Promise<StorageStats> {
  const { data, error } = await db.rpc('log_storage_stats');
  if (error) throw new Error(error.message);
  return normalizeStorage(data);
}

type RawStorage = { db_bytes?: number; tables?: Record<string, { bytes?: number; rows?: number; dead?: number; last_autovacuum?: string | null }>; top_tables?: { name: string; bytes: number }[] | null };
export function normalizeStorage(raw: unknown): StorageStats {
  const r = (raw ?? {}) as RawStorage;
  return {
    db_bytes: Number(r.db_bytes ?? 0),
    tables: Object.entries(r.tables ?? {}).map(([table, v]) => ({ table, bytes: Number(v.bytes ?? 0), rows: Number(v.rows ?? 0), dead: Number(v.dead ?? 0), last_autovacuum: v.last_autovacuum ?? null })),
    top: (r.top_tables ?? []).map((t) => ({ table: t.name, bytes: Number(t.bytes) })),
  };
}

/** Storage alert text, or null when everything is fine. Pure — unit-tested. */
export function storageAlert(s: StorageStats, limit = FREE_DB_LIMIT_BYTES): string | null {
  const level = storageLevel(s.db_bytes, limit);
  const logTables = new Set(LOG_POLICY.map((p) => p.table));
  const big = s.tables.filter((t) => logTables.has(t.table) && t.bytes >= TABLE_WARN_BYTES);
  if (level === 'ok' && !big.length) return null;
  const mb = (b: number) => (b / 1048576).toFixed(1);
  const lines = [`💾 ${level === 'critical' ? 'מסד הנתונים כמעט מלא' : 'אזהרת נפח במסד הנתונים'}: ${mb(s.db_bytes)}MB מתוך ${mb(limit)}MB (${Math.round((s.db_bytes / limit) * 100)}%).`];
  for (const t of big) lines.push(`• יומן ${t.table} תופס ${mb(t.bytes)}MB`);
  lines.push('הניקוי האוטומטי רץ כל לילה. פרטים: Ops → משפטי → אבטחה ופרטיות → יומנים.');
  return lines.join('\n');
}

/** Dead-tuple heavy log tables that would benefit from a plain VACUUM (never VACUUM FULL). */
export function vacuumCandidates(s: StorageStats): string[] {
  return s.tables.filter((t) => t.dead > 5000 && t.dead > t.rows).map((t) => t.table);
}

export async function runLogRetentionJob(db: SupabaseClient, opts: { dryRun?: boolean } = {}) {
  const { data, error } = await db.rpc('run_log_retention', { p_dry_run: opts.dryRun ?? false, p_batch: 2000 });
  if (error) throw new Error(error.message);
  const result = data as RetentionResult;
  const storage = await readStorage(db);
  const alert = storageAlert(storage);
  if (alert) {
    const day = new Date().toISOString().slice(0, 10);
    const { data: prev } = await db.from('ops_security_events').select('id').eq('kind', 'storage_alert').contains('facts', { day }).limit(1);
    if (!prev?.length) {
      await db.from('ops_security_events').insert({ kind: 'storage_alert', facts: { day, db_bytes: storage.db_bytes }, alerted_at: new Date().toISOString() });
      const { alertOwnerSecurity } = await import('@/lib/ops/device-notify');
      await alertOwnerSecurity(db, null, alert, 'אזהרת נפח במסד הנתונים').catch(() => undefined);
    }
  }
  const deleted = Object.values(result.tables ?? {}).reduce((a, t) => a + (t.deleted || 0), 0);
  return { result, deleted, db_bytes: storage.db_bytes, alert: !!alert, vacuum: vacuumCandidates(storage) };
}
