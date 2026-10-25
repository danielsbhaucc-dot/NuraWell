import { NextResponse } from 'next/server';
import { requireApiAdmin } from '@/lib/api/route-guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { readStorage } from '@/lib/logs/retention-job';
import { CLASS_HE, FREE_DB_LIMIT_BYTES, LOG_POLICY, retentionHe, storageLevel } from '@/lib/logs/policy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Storage used per log type, retention per type, and DB size vs the free-plan limit (admins only). */
export async function GET(request: Request) {
  const auth = await requireApiAdmin(request);
  if (!auth.ok) return auth.response;
  const db = createAdminClient();
  try {
    const s = await readStorage(db);
    const byTable = new Map(s.tables.map((t) => [t.table, t]));
    const { data: last } = await db.from('log_retention_runs').select('created_at,dry_run').order('created_at', { ascending: false }).limit(1);
    return NextResponse.json({
      db_bytes: s.db_bytes, limit_bytes: FREE_DB_LIMIT_BYTES, level: storageLevel(s.db_bytes),
      last_run: last?.[0] ?? null,
      types: LOG_POLICY.map((p) => ({ table: p.table, label: p.label, klass: p.klass, klass_he: CLASS_HE[p.klass], days: p.days, retention_he: retentionHe(p.days), bytes: byTable.get(p.table)?.bytes ?? 0, rows: byTable.get(p.table)?.rows ?? 0 })),
      top: s.top,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'load_failed' }, { status: 500 });
  }
}
