'use client';
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, RefreshCw, Search, TrendingDown, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { Anomaly, Explained, Story, Summary } from '@/lib/logging/insights';
import { ago, CatIcon, Chip, Empty, fmtIl, Glass, Pill, Skeleton, Stat, STATUS, type Status } from './glass';

type Feed = { events: Explained[]; stories: Story[]; anomalies: Anomaly[]; summary: Summary; nextBefore: string | null };
const CATS: [string, string][] = [['all', 'הכל'], ['login', 'כניסות'], ['security', 'אבטחה'], ['email', 'מייל'], ['telegram', 'טלגרם'], ['push', 'פוש'], ['device', 'מכשירים'], ['cron', 'משימות'], ['ai', 'AI']];
const STATUSES: ('all' | Status)[] = ['all', 'failed', 'security', 'warning', 'pending', 'success', 'info'];
const RANGES: [string, string][] = [['1h', 'שעה'], ['24h', '24 שעות'], ['7d', 'שבוע'], ['30d', 'חודש']];

function EventRow({ e }: { e: Explained }) {
  const [open, setOpen] = useState(false);
  const s = STATUS[e.status];
  return (
    <Glass glow={e.severity >= 6 ? e.status : undefined} className="p-0">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-start gap-3 p-3.5 text-start" aria-expanded={open}>
        <span className={cn('mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-2xl text-white shadow-sm', s.dot)}><CatIcon cat={e.category} /></span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-slate-900 dark:text-white">{e.title}</span>
            <Pill status={e.status} />
            {e.severity >= 6 ? <span className="rounded-full bg-rose-500/15 px-2 text-[10px] font-bold text-rose-600">חומרה {e.severity}/10</span> : null}
          </span>
          <span className="text-[13px] leading-snug text-slate-600 dark:text-slate-300">{e.why}</span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1 text-[11px] text-slate-500"><span title={fmtIl(e.at)}>{ago(e.at)}</span><ChevronDown size={14} className={cn('transition', open && 'rotate-180')} /></span>
      </button>
      {open ? (
        <div className="animate-in fade-in slide-in-from-top-1 border-t border-white/40 px-4 py-3 text-[13px] dark:border-white/10">
          {e.todo ? <p className="mb-2 rounded-2xl bg-amber-400/10 px-3 py-2 text-amber-800 dark:text-amber-200">💡 מה לעשות: {e.todo}</p> : null}
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-slate-600 dark:text-slate-300">
            <dt className="text-slate-400">זמן</dt><dd>{fmtIl(e.at)}</dd>
            <dt className="text-slate-400">אירוע</dt><dd dir="ltr" className="text-end font-mono text-xs">{e.event}</dd>
            {e.actor ? <Fragment><dt className="text-slate-400">מבצע</dt><dd dir="ltr" className="text-end font-mono text-xs">{e.actor}</dd></Fragment> : null}
            {Object.entries(e.detail).filter(([, v]) => v != null && v !== '').map(([k, v]) => <Fragment key={k}><dt className="text-slate-400">{k}</dt><dd className="break-words">{String(v)}</dd></Fragment>)}
          </dl>
          <p className="mt-2 text-[11px] text-slate-400">🔒 פרטים מצונזרים: בלי קודים, טוקנים, מיילים או מזהים מלאים.</p>
        </div>
      ) : null}
    </Glass>
  );
}

function StoryCard({ s }: { s: Story }) {
  const [open, setOpen] = useState(s.severity >= 6);
  return (
    <Glass glow={s.outcome} className="p-0">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center gap-3 p-3.5 text-start">
        <span className={cn('grid h-9 w-9 place-items-center rounded-2xl text-white', STATUS[s.outcome].dot)}><CatIcon cat="login" /></span>
        <span className="min-w-0 flex-1"><span className="block font-bold text-slate-900 dark:text-white">{s.headline}</span><span className="text-[12px] text-slate-500">{s.events.length} שלבים · {fmtIl(s.start)}</span></span>
        <Pill status={s.outcome} />
      </button>
      {open ? (
        <ol className="relative ms-8 border-s-2 border-dashed border-slate-300/60 pb-3 pe-4 ps-4 dark:border-white/15">
          {s.events.map((e) => (
            <li key={e.id} className="relative py-1.5 text-[13px]">
              <span className={cn('absolute -start-[1.4rem] top-3 h-2.5 w-2.5 rounded-full ring-4 ring-white/70 dark:ring-slate-900/70', STATUS[e.status].dot)} />
              <span className="font-semibold text-slate-800 dark:text-slate-100">{e.title}</span> <span className="text-slate-400">· {new Date(e.at).toLocaleTimeString('he-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
            </li>
          ))}
        </ol>
      ) : null}
    </Glass>
  );
}

export function ActivityLog() {
  const [range, setRange] = useState('24h');
  const [cat, setCat] = useState('all');
  const [status, setStatus] = useState<'all' | Status>('all');
  const [actor, setActor] = useState('all');
  const [q, setQ] = useState('');
  const [view, setView] = useState<'feed' | 'stories'>('feed');
  const [feed, setFeed] = useState<Feed | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState(true);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/v1/admin/logs?range=${range}`, { cache: 'no-store' });
      if (!r.ok) throw new Error(String(r.status));
      setFeed(await r.json());
      setErr(null);
    } catch {
      setErr('לא הצלחתי לטעון את היומן. ננסה שוב בעוד רגע.');
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => { setLoading(true); void load(); }, [load]);
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 15_000);
    return () => clearInterval(t);
  }, [live, load]);

  const actors = useMemo(() => [...new Set((feed?.events ?? []).map((e) => e.actor).filter(Boolean))] as string[], [feed]);
  const shown = useMemo(() => (feed?.events ?? []).filter((e) =>
    (cat === 'all' || e.category === cat) && (status === 'all' || e.status === status) && (actor === 'all' || e.actor === actor) &&
    (!q || `${e.title} ${e.why} ${e.event} ${Object.values(e.detail).join(' ')}`.toLowerCase().includes(q.toLowerCase()))), [feed, cat, status, actor, q]);

  const sm = feed?.summary;
  return (
    <div className="flex flex-col gap-4">
      {feed?.anomalies.length ? (
        <div className="flex flex-col gap-2">
          {feed.anomalies.slice(0, 5).map((a) => (
            <Glass key={a.key} glow="failed" className="flex items-start gap-3 bg-gradient-to-l from-rose-500/10 to-violet-500/10">
              <span className="text-xl">🚨</span>
              <div className="min-w-0 flex-1">
                <div className="font-bold text-rose-700 dark:text-rose-300">{a.title} <span className="text-xs font-semibold opacity-70">· חומרה {a.severity}/10</span></div>
                <div className="text-[13px] text-slate-700 dark:text-slate-200">{a.why}</div>
                <div className="mt-1 text-[12px] text-slate-500">מה לעשות: {a.todo}</div>
              </div>
              <Link prefetch={false} href="/ops/ceo/security" className="shrink-0 rounded-full bg-slate-900 px-3 py-1.5 text-xs font-bold text-white dark:bg-white dark:text-slate-900">מכשירים</Link>
            </Glass>
          ))}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Stat label="אירועים" value={sm?.total ?? '—'} status="info" sub={RANGES.find((r) => r[0] === range)?.[1]} />
        <Stat label="כישלונות" value={sm?.byStatus.failed ?? '—'} status="failed" sub={sm ? <span className="inline-flex items-center gap-1">{sm.trend === 'up' ? <TrendingUp size={12} className="text-rose-500" /> : sm.trend === 'down' ? <TrendingDown size={12} className="text-emerald-500" /> : null}{Math.round(sm.failRate * 100)}% מול {Math.round(sm.baselineFailRate * 100)}% רגיל</span> : null} />
        <Stat label="אבטחה" value={sm?.byStatus.security ?? '—'} status="security" />
        <Stat label="ממתינים" value={sm?.byStatus.pending ?? '—'} status="pending" />
      </div>

      <Glass className="sticky top-2 z-10 flex flex-col gap-2.5 p-3">
        <div className="flex items-center gap-2">
          <label className="flex flex-1 items-center gap-2 rounded-2xl bg-white/70 px-3 py-2 dark:bg-white/10">
            <Search size={16} className="text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש ביומן…" className="w-full bg-transparent text-sm outline-none" />
          </label>
          <button type="button" onClick={() => setLive(!live)} className={cn('flex items-center gap-1.5 rounded-2xl px-3 py-2 text-xs font-bold', live ? 'bg-emerald-500/15 text-emerald-700' : 'bg-white/60 text-slate-500')}>
            <span className={cn('h-2 w-2 rounded-full', live ? 'animate-pulse bg-emerald-500' : 'bg-slate-400')} />{live ? 'חי' : 'מושהה'}
          </button>
          <button type="button" onClick={() => void load()} aria-label="רענון" className="rounded-2xl bg-white/60 p-2 dark:bg-white/10"><RefreshCw size={16} /></button>
        </div>
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">{RANGES.map(([k, l]) => <Chip key={k} active={range === k} onClick={() => setRange(k)}>{l}</Chip>)}<span className="mx-1 w-px bg-slate-300/50" /><Chip active={view === 'feed'} onClick={() => setView('feed')}>אירועים</Chip><Chip active={view === 'stories'} onClick={() => setView('stories')}>סיפורי כניסה</Chip></div>
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">{CATS.map(([k, l]) => <Chip key={k} active={cat === k} onClick={() => setCat(k)}>{l}</Chip>)}</div>
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
          {STATUSES.map((s) => <Chip key={s} active={status === s} onClick={() => setStatus(s)}>{s === 'all' ? 'כל הסטטוסים' : STATUS[s].label}</Chip>)}
          {actors.length > 1 ? <select value={actor} onChange={(e) => setActor(e.target.value)} className="rounded-full bg-white/60 px-3 text-xs dark:bg-white/10"><option value="all">כל המשתמשים</option>{actors.map((a) => <option key={a} value={a}>{a}</option>)}</select> : null}
        </div>
      </Glass>

      {loading && !feed ? <Skeleton /> : err && !feed ? <Glass glow="failed" className="text-center text-rose-700">{err}</Glass> : view === 'stories' ? (
        feed?.stories.length ? <div className="flex flex-col gap-2.5">{feed.stories.map((s) => <StoryCard key={s.id} s={s} />)}</div> : <Empty title="אין עדיין סיפורי כניסה בטווח הזה" />
      ) : shown.length ? <div className="flex flex-col gap-2.5">{shown.map((e) => <EventRow key={e.id} e={e} />)}</div> : <Empty title="שקט כאן" sub="אין אירועים שמתאימים לסינון." />}
      {err && feed ? <p className="text-center text-xs text-rose-600">{err}</p> : null}
    </div>
  );
}
