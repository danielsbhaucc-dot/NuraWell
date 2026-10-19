import { ensureOpsAdminServer } from '@/lib/auth/ensure-ops-admin-server';
import { createAdminClient } from '@/lib/supabase/admin';
import { Card } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'שגיאות מערכת' };

type Row = { id: string; created_at: string; severity: string; source: string | null; route: string | null; message: string; environment: string };

const fmt = new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Admin: server errors from error_events (last 7 days), grouped by source + message. */
export default async function OpsErrorsPage() {
  await ensureOpsAdminServer();
  const since = new Date(Date.now() - 7 * 86400_000).toISOString();
  const { data } = await createAdminClient()
    .from('error_events')
    .select('id, created_at, severity, source, route, message, environment')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(500);
  const rows = (data ?? []) as Row[];
  const groups = new Map<string, { count: number; last: Row }>();
  for (const r of rows) {
    const k = `${r.source ?? r.route ?? '?'}|${r.message.slice(0, 120)}`;
    const g = groups.get(k);
    if (g) g.count += 1;
    else groups.set(k, { count: 1, last: r });
  }
  const list = [...groups.values()].sort((a, b) => b.count - a.count);
  return (
    <div className="flex flex-col gap-4">
      <h1 className="px-1 font-display text-[1.75rem] font-black leading-tight tracking-tight text-slate-900">שגיאות מערכת</h1>
      <p className="text-sm text-primary-800/80">7 הימים האחרונים · {rows.length} אירועים · {list.length} סוגים</p>
      {list.length === 0 ? <Card>אין שגיאות 🎉</Card> : null}
      {list.map(({ count, last }) => (
        <Card key={last.id} className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-2 text-xs text-primary-700">
            <span dir="ltr" className="font-mono">{last.source ?? last.route ?? '—'}</span>
            <span>
              ×{count} · אחרון {fmt.format(new Date(last.created_at))} · {last.environment}
            </span>
          </div>
          <p dir="ltr" className="wrap-break-word text-start font-mono text-sm text-primary-950">{last.message}</p>
        </Card>
      ))}
    </div>
  );
}
