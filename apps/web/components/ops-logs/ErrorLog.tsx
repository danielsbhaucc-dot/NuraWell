'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowUpLeft, Users } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { Issue, IssueStatus } from '@/lib/logging/errors';
import { ago, Dot, Empty, fmtIl, Glass, Metrics, Stripe, SearchBar, Section, Segmented, Skeleton, Spark, type Status } from './glass';

const ST: Record<IssueStatus, { label: string; status: Status }> = { new: { label: 'חדש', status: 'failed' }, in_progress: { label: 'בטיפול', status: 'pending' }, resolved: { label: 'נפתר', status: 'success' } };
const sevStatus = (n: number): Status => (n >= 8 ? 'failed' : n >= 5 ? 'warning' : 'info');
type Filter = 'open' | IssueStatus | 'all';

function IssueRow({ i, onChange }: { i: Issue; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const act = async (body: Record<string, unknown>) => {
    setBusy(true); setMsg(null);
    const r = await fetch('/api/v1/admin/logs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    setBusy(false);
    setMsg(r?.ok ? (j.already ? 'כבר אצל אורי' : 'עודכן') : 'לא הצליח, נסה שוב');
    if (r?.ok) onChange();
  };
  return (
    <li className={cn('relative', i.status === 'resolved' && 'opacity-55')}>
      {i.status !== 'resolved' ? <Stripe status={i.severity >= 8 ? 'failed' : i.severity >= 5 ? 'warning' : 'info'} /> : null}
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-3.5 text-start hover:bg-gc/50">
        <span className={cn('w-7 shrink-0 text-center text-[13px] font-semibold tabular-nums', i.severity >= 8 ? 'text-rose-700' : i.severity >= 5 ? 'text-amber-700' : 'text-slate-500')} title="חומרה מתוך 10">{i.severity}</span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2"><Dot status={ST[i.status].status} /><span className="truncate text-[14px] font-medium text-slate-900 dark:text-gc">{i.cause}</span></span>
          <span className="mt-0.5 flex gap-2 ps-4 text-[12.5px] text-slate-500"><span dir="ltr" className="truncate font-mono text-[12px]">{i.source}</span><span>· {i.count}× · {ago(i.lastSeen)}</span></span>
        </span>
        <Spark data={i.spark} status={sevStatus(i.severity)} />
      </button>
      {open ? (
        <div className="px-4 pb-4 ps-14 text-[13px] text-slate-600 dark:text-slate-300">
          <p className="mb-2"><span className="font-medium text-slate-800 dark:text-gc">השפעה: </span>{i.impact}</p>
          <p dir="ltr" className="mb-3 break-words rounded-lg bg-black/[0.03] px-3 py-2 text-start font-mono text-[12px] text-slate-500">{i.sample}</p>
          <div className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-slate-500">
            <span className="inline-flex items-center gap-1"><Users size={12} />{i.users} משתמשים</span><span>ראשון {fmtIl(i.firstSeen)}</span><span>אחרון {fmtIl(i.lastSeen)}</span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Segmented value={i.status} options={[['new', 'חדש'], ['in_progress', 'בטיפול'], ['resolved', 'נפתר']]} onChange={(s) => void act({ action: 'error_status', fp: i.fingerprint, status: s })} />
            <button type="button" disabled={busy} onClick={() => void act({ action: 'forward', fp: i.fingerprint })} className="inline-flex items-center gap-1 text-[13px] font-medium text-slate-800 underline underline-offset-4 disabled:opacity-50 dark:text-gc"><ArrowUpLeft size={14} />העבר לאורי</button>
            {msg ? <span className="text-[12px] text-slate-500">{msg}</span> : null}
          </div>
        </div>
      ) : null}
    </li>
  );
}

export function ErrorLog() {
  const [issues, setIssues] = useState<Issue[] | null>(null);
  const [err, setErr] = useState(false);
  const [filter, setFilter] = useState<Filter>('open');
  const [q, setQ] = useState('');
  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/v1/admin/logs?view=errors', { cache: 'no-store' });
      if (!r.ok) throw new Error();
      setIssues((await r.json()).issues); setErr(false);
    } catch { setErr(true); }
  }, []);
  useEffect(() => { void load(); const t = setInterval(() => document.visibilityState === 'visible' && void load(), 30_000); return () => clearInterval(t); }, [load]);
  const list = useMemo(() => (issues ?? []).filter((i) => (filter === 'all' ? true : filter === 'open' ? i.status !== 'resolved' : i.status === filter) &&
    (!q || `${i.cause} ${i.source} ${i.sample}`.toLowerCase().includes(q.toLowerCase()))), [issues, filter, q]);
  if (!issues) return err ? <Glass><Empty title="לא הצלחתי לטעון שגיאות" sub="אנסה שוב בעוד רגע." /></Glass> : <Skeleton />;
  const open = issues.filter((i) => i.status !== 'resolved');
  return (
    <div className="flex flex-col gap-8">
      <Metrics items={[
        { label: 'פתוחות', value: open.length, status: 'failed' },
        { label: 'חמורות', value: open.filter((i) => i.severity >= 8).length, status: 'security', sub: 'חומרה 8+' },
        { label: 'בעלייה', value: open.filter((i) => i.trend === 'up').length, status: 'warning' },
        { label: 'אירועים · 7 ימים', value: issues.reduce((a, i) => a + i.count, 0) },
      ]} />
      <Section title="בעיות" aside={<span className="text-[12px] text-slate-500">{list.length}</span>}>
        <SearchBar value={q} onChange={setQ} placeholder="חיפוש שגיאה או מקור" />
        <div><Segmented value={filter} options={[['open', 'פתוחות'], ['new', 'חדשות'], ['in_progress', 'בטיפול'], ['resolved', 'נפתרו'], ['all', 'הכל']]} onChange={setFilter} /></div>
        <Glass className="overflow-hidden">
          {list.length ? <ul className="divide-y divide-black/[0.05] dark:divide-gc/10">{list.map((i) => <IssueRow key={i.fingerprint} i={i} onChange={load} />)}</ul> : <Empty title="אין שגיאות פתוחות" sub="הכל שקט." />}
        </Glass>
      </Section>
    </div>
  );
}
