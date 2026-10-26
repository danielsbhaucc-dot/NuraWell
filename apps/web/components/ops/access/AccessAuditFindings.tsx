import { createAdminClient } from '@/lib/supabase/admin';
import { Badge, Card, CardTitle, EmptyState, ListRow } from '@/components/ui';
import { AckFindingButton } from './AckFindingButton';

const SEV: Record<string, { label: string; tone: 'dark' | 'warm' | 'soft' }> = { high: { label: 'חמור', tone: 'dark' }, medium: { label: 'בינוני', tone: 'warm' }, low: { label: 'נמוך', tone: 'soft' } };
const fmt = (s: string) => new Intl.DateTimeFormat('he-IL', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Jerusalem' }).format(new Date(s));

/** Server component: last 14 days of nightly access-audit findings (admin page only; service role read). */
export async function AccessAuditFindings() {
  const db = createAdminClient();
  const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
  const [{ data: f }, { data: runs }] = await Promise.all([
    db.from('access_audit_findings').select('id, created_at, severity, signals, summary, event_kind, acknowledged_at, acknowledged_by').gte('created_at', since).order('created_at', { ascending: false }).limit(30),
    db.from('access_audit_runs').select('started_at, events, flagged, model_called').order('started_at', { ascending: false }).limit(1),
  ]);
  const rows = (f ?? []) as { id: string; created_at: string; severity: string; signals: string[]; summary: string; event_kind: string; acknowledged_at: string | null; acknowledged_by: string | null }[];
  const open = rows.filter((r) => !r.acknowledged_at);
  const done = rows.filter((r) => r.acknowledged_at);
  const sev = (r: (typeof rows)[number]) => <Badge tone={SEV[r.severity]?.tone ?? 'soft'}>{SEV[r.severity]?.label ?? r.severity}</Badge>;
  const last = (runs ?? [])[0] as { started_at: string; events: number; flagged: number; model_called: boolean } | undefined;
  return (
    <Card className="space-y-3">
      <CardTitle>ביקורת גישה לילית</CardTitle>
      <p className="text-sm text-ink-soft">{last ? `ריצה אחרונה ${fmt(last.started_at)}: ${last.events} אירועים, ${last.flagged} סומנו${last.model_called ? ', נבדקו בבינה מלאכותית' : ''}.` : 'עדיין לא הייתה ריצה.'}</p>
      {!rows.length ? <EmptyState icon="🛡️" title="אין ממצאים ב-14 הימים האחרונים" /> : (
        <>
          <h3 className="text-sm font-extrabold text-ink">פתוחים ({open.length})</h3>
          {open.length ? open.map((r) => (
            <ListRow key={r.id} title={r.summary} meta={`${fmt(r.created_at)} · ${r.event_kind} · ${r.signals.join(', ')}`} trailing={<div className="flex items-center gap-2">{sev(r)}<AckFindingButton id={r.id} /></div>} />
          )) : <p className="text-sm text-ink-soft">אין ממצאים פתוחים.</p>}
          {done.length ? (
            <>
              <h3 className="pt-2 text-sm font-extrabold text-ink-soft">נבדקו ({done.length})</h3>
              {done.map((r) => (
                <ListRow key={r.id} className="opacity-70" title={r.summary} meta={`${fmt(r.created_at)} · נבדק ${fmt(r.acknowledged_at as string)}${r.acknowledged_by ? ` · ${r.acknowledged_by.slice(0, 8)}` : ''}`} trailing={sev(r)} />
              ))}
            </>
          ) : null}
        </>
      )}
    </Card>
  );
}
