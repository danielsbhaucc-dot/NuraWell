'use client';
import { useCallback, useEffect, useState } from 'react';
import { ArrowUpRight, ChevronDown, TrendingDown, TrendingUp, Users } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { Issue, IssueStatus } from '@/lib/logging/errors';
import { ago, Chip, Empty, fmtIl, Glass, Pill, Skeleton, Spark, Stat, type Status } from './glass';

const ST: Record<IssueStatus, { label: string; status: Status }> = { new: { label: 'חדש', status: 'failed' }, in_progress: { label: 'בטיפול', status: 'pending' }, resolved: { label: 'נפתר', status: 'success' } };
const sevStatus = (n: number): Status => (n >= 8 ? 'failed' : n >= 5 ? 'warning' : 'info');

function IssueCard({ i, onChange }: { i: Issue; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const act = async (body: Record<string, unknown>, label: string) => {
    setBusy(label); setMsg(null);
    const r = await fetch('/api/v1/admin/logs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    setBusy(null);
    setMsg(r?.ok ? (j.already ? 'כבר הועבר לאור ✓' : 'בוצע ✓') : 'לא הצליח, נסה שוב');
    if (r?.ok) onChange();
  };
  return (
    <Glass glow={i.status === 'resolved' ? undefined : sevStatus(i.severity)} className={cn('p-0', i.status === 'resolved' && 'opacity-60')}>
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-start gap-3 p-3.5 text-start">
        <span className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-2xl font-display text-sm font-black text-white', i.severity >= 8 ? 'bg-rose-500' : i.severity >= 5 ? 'bg-amber-500' : 'bg-slate-400')}>{i.severity}</span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex flex-wrap items-center gap-2"><span dir="ltr" className="font-mono text-xs text-slate-500">{i.source}</span><Pill status={ST[i.status].status}>{ST[i.status].label}</Pill>{i.trend === 'up' ? <TrendingUp size={14} className="text-rose-500" /> : i.trend === 'down' ? <TrendingDown size={14} className="text-emerald-500" /> : null}</span>
          <span className="font-bold text-slate-900 dark:text-white">{i.cause}</span>
          <span dir="ltr" className="truncate text-start font-mono text-[11px] text-slate-500">{i.sample}</span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1.5">
          <span className="rounded-full bg-slate-900/80 px-2 text-xs font-bold text-white">×{i.count}</span>
          <Spark data={i.spark} status={sevStatus(i.severity)} />
        </span>
      </button>
      {open ? (
        <div className="border-t border-white/40 px-4 py-3 text-[13px] dark:border-white/10">
          <p className="mb-2 text-slate-700 dark:text-slate-200"><b>השפעה:</b> {i.impact}</p>
          <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-slate-500">
            <span className="inline-flex items-center gap-1"><Users size={12} />{i.users} משתמשים מושפעים</span>
            <span>ראשון: {fmtIl(i.firstSeen)}</span><span>אחרון: {ago(i.lastSeen)}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(['new', 'in_progress', 'resolved'] as IssueStatus[]).map((s) => <Chip key={s} active={i.status === s} onClick={() => void act({ action: 'error_status', fp: i.fingerprint, status: s }, s)}>{ST[s].label}</Chip>)}
            <button type="button" disabled={!!busy} onClick={() => void act({ action: 'forward', fp: i.fingerprint }, 'fw')} className="inline-flex items-center gap-1 rounded-full bg-violet-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"><ArrowUpRight size={14} />העבר לאור</button>
          </div>
          {msg ? <p className="mt-2 text-xs text-slate-500">{msg}</p> : null}
        </div>
      ) : null}
      {!open ? <ChevronDown size={14} className="mx-auto -mt-2 mb-1 text-slate-400" /> : null}
    </Glass>
  );
}

export function ErrorLog() {
  const [issues, setIssues] = useState<Issue[] | null>(null);
  const [err, setErr] = useState(false);
  const [filter, setFilter] = useState<'open' | 'all' | IssueStatus>('open');
  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/v1/admin/logs?view=errors', { cache: 'no-store' });
      if (!r.ok) throw new Error();
      setIssues((await r.json()).issues);
      setErr(false);
    } catch { setErr(true); }
  }, []);
  useEffect(() => { void load(); const t = setInterval(() => document.visibilityState === 'visible' && void load(), 30_000); return () => clearInterval(t); }, [load]);
  if (!issues) return err ? <Glass glow="failed" className="text-center text-rose-700">לא הצלחתי לטעון שגיאות.</Glass> : <Skeleton />;
  const open = issues.filter((i) => i.status !== 'resolved');
  const list = issues.filter((i) => (filter === 'all' ? true : filter === 'open' ? i.status !== 'resolved' : i.status === filter));
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Stat label="בעיות פתוחות" value={open.length} status="failed" />
        <Stat label="חמורות (8+)" value={open.filter((i) => i.severity >= 8).length} status="security" />
        <Stat label="במגמת עלייה" value={open.filter((i) => i.trend === 'up').length} status="warning" />
        <Stat label="אירועים · 7 ימים" value={issues.reduce((a, i) => a + i.count, 0)} status="info" />
      </div>
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1">{([['open', 'פתוחות'], ['new', 'חדשות'], ['in_progress', 'בטיפול'], ['resolved', 'נפתרו'], ['all', 'הכל']] as const).map(([k, l]) => <Chip key={k} active={filter === k} onClick={() => setFilter(k)}>{l}</Chip>)}</div>
      {list.length ? <div className="flex flex-col gap-2.5">{list.map((i) => <IssueCard key={i.fingerprint} i={i} onChange={load} />)}</div> : <Empty title="אין שגיאות פתוחות 🎉" />}
    </div>
  );
}
