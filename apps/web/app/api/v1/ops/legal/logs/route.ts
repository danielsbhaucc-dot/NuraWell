import { NextResponse } from 'next/server';
import { requireApiAdmin } from '@/lib/api/route-guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { filtersFrom, queryLogs } from '@/lib/logs/query';
import { logLogsAccess } from '@/lib/logs/audit-view';
import { hashIp } from '@/lib/logs/signals';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Ops → אבטחה ופרטיות → יומנים: filtered, paginated, masked-by-default log view (admins only). */
export async function GET(request: Request) {
  const auth = await requireApiAdmin(request);
  if (!auth.ok) return auth.response;
  const f = filtersFrom(new URL(request.url));
  f.pageSize = Math.min(f.pageSize ?? 50, 100);
  const db = createAdminClient();
  try {
    const out = await queryLogs(db, f);
    for (const r of out.rows) if (r.inv) { if (r.inv.ipRaw) r.inv.ipHash = hashIp(r.inv.ipRaw); delete r.inv.ipRaw; }
    if (f.reveal || (f.page ?? 1) === 1) await logLogsAccess(db, auth.user.id, f.reveal ? 'logs_revealed' : 'logs_viewed', f, out.rows.length);
    return NextResponse.json(out, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'load_failed' }, { status: 500 });
  }
}
