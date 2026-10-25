import { NextResponse } from 'next/server';
import { requireApiAdmin } from '@/lib/api/route-guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { filtersFrom, queryLogs, toCsv } from '@/lib/logs/query';
import { logLogsAccess } from '@/lib/logs/audit-view';
import { recordBulkExport } from '@/lib/logs/signals';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** CSV export of the current filter (admins only, max 5000 rows, masked unless reveal=1). Logged. */
export async function GET(request: Request) {
  const auth = await requireApiAdmin(request);
  if (!auth.ok) return auth.response;
  const f = { ...filtersFrom(new URL(request.url)), page: 1, pageSize: 5000 };
  const db = createAdminClient();
  try {
    const out = await queryLogs(db, f);
    await logLogsAccess(db, auth.user.id, 'logs_exported', f, out.rows.length);
    await recordBulkExport(db, request, auth.user.id, out.rows.length);
    const name = `nurawell-logs-${f.type}-${new Date().toISOString().slice(0, 10)}.csv`;
    return new NextResponse(toCsv(out.rows), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'export_failed' }, { status: 500 });
  }
}
