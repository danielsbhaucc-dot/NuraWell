'use client';
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { Anomaly, Explained, Story, Summary } from '@/lib/logging/insights';
import { ActiveFilters, ago, CatIcon, Dot, Empty, fmtIl, Glass, Metrics, Stripe, OptionGroup, Pill, SearchBar, Section, Segmented, Sheet, Skeleton, STATUS, useDisclosure, type Status } from './glass';

type Feed = { events: Explained[]; stories: Story[]; anomalies: Anomaly[]; summary: Summary; nextBefore: string | null };
type Range = '1h' | '24h' | '7d' | '30d';
const CATS: [string, string][] = [['all', 'הכל'], ['login', 'כניסות'], ['security', 'אבטחה'], ['email', 'מייל'], ['telegram', 'טלגרם'], ['push', 'פוש'], ['device', 'מכשירים'], ['cron', 'משימות'], ['ai', 'AI']];
const STATUSES: ['all' | Status, string, Status?][] = [['all', 'הכל'], ['failed', 'נכשל', 'failed'], ['security', 'אבטחה', 'security'], ['warning', 'אזהרה', 'warning'], ['pending', 'ממתין', 'pending'], ['success', 'הצליח', 'success']];
const RANGES: [Range, string][] = [['1h', 'שעה'], ['24h', 'יום'], ['7d', 'שבוע'], ['30d', 'חודש']];

function EventRow({ e }: { e: Explained }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="relative">
      <Stripe status={e.status} />
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-3.5 text-start transition hover:bg-cream/50">
        <CatIcon cat={e.category} className="shrink-0 text-slate-500" />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2"><Dot status={e.status} pulse={e.status === 'pending'} /><span className="truncate text-[14px] font-medium text-slate-900 dark:text-cream">{e.title}</span></span>
          <span className="mt-0.5 block truncate ps-4 text-[12.5px] text-slate-500">{e.why}</span>
        </span>
        <span className="shrink-0 text-[12px] tabular-nums text-slate-500" title={fmtIl(e.at)}>{ago(e.at)}</span>
      </button>
      {open ? (
        <div className="px-4 pb-4 ps-11 text-[13px]">
          {e.todo ? <p className="mb-3 text-slate-700 dark:text-slate-200"><span className="font-medium">מה לעשות: </span>{e.todo}</p> : null}
          <dl className="grid grid-cols-[6rem_1fr] gap-x-3 gap-y-1.5 text-slate-600 dark:text-slate-300">
            <dt className="text-slate-500">סטטוס</dt><dd><Pill status={e.status} /> {e.severity >= 6 ? <span className="text-slate-500">· חומרה {e.severity}/10</span> : null}</dd>
            <dt className="text-slate-500">זמן</dt><dd>{fmtIl(e.at)}</dd>
            <dt className="text-slate-500">אירוע</dt><dd dir="ltr" className="text-end font-mono text-[12px]">{e.event}</dd>
            {e.actor ? <Fragment><dt className="text-slate-500">מבצע</dt><dd dir="ltr" className="text-end font-mono text-[12px]">{e.actor}</dd></Fragment> : null}
            {Object.entries(e.detail).filter(([, v]) => v != null && v !== '').map(([k, v]) => <Fragment key={k}><dt className="text-slate-500">{k}</dt><dd className="break-words">{String(v)}</dd></Fragment>)}
          </dl>
          <p className="mt-3 text-[11.5px] text-slate-500">פרטים מצונזרים — בלי קודים, טוקנים, מיילים או מזהים מלאים.</p>
        </div>
      ) : null}
    </li>
  );
}

function StoryRow({ s }: { s: Story }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="relative">
      <Stripe status={s.outcome} />
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-3.5 text-start hover:bg-cream/50">
        <CatIcon cat="login" className="shrink-0 text-slate-500" />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2"><Dot status={s.outcome} /><span className="truncate text-[14px] font-medium text-slate-900 dark:text-cream">{s.headline}</span></span>
          <span className="mt-0.5 block ps-4 text-[12.5px] text-slate-500">{s.events.length} שלבים · {fmtIl(s.start)}</span>
        </span>
        <ChevronLeft size={16} className={cn('shrink-0 text-slate-300 transition', open && '-rotate-90')} />
      </button>
      {open ? (
        <ol className="mb-3 me-4 ms-[1.6rem] border-s border-black/10 ps-5 dark:border-cream/15">
          {s.events.map((e) => (
            <li key={e.id} className="relative py-1.5 text-[13px] text-slate-700 dark:text-slate-200">
              <span className={cn('absolute -start-[1.6rem] top-[0.7rem] h-1.5 w-1.5 rounded-full', STATUS[e.status].dot)} />
              {e.title} <span className="text-slate-500">· {new Date(e.at).toLocaleTimeString('he-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
            </li>
          ))}
        </ol>
      ) : null}
    </li>
  );
}

export function ActivityLog() {
  const [range, setRange] = useState<Range>('24h');
  const [cat, setCat] = useState('all');
  const [status, setStatus] = useState<'all' | Status>('all');
  const [q, setQ] = useState('');
  const [view, setView] = useState<'feed' | 'stories'>('feed');
  const [feed, setFeed] = useState<Feed | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState(true);
  const sheet = useDisclosure();

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/v1/admin/logs?range=${range}`, { cache: 'no-store' });
      if (!r.ok) throw new Error(String(r.status));
      setFeed(await r.json()); setErr(null);
    } catch { setErr('לא הצלחתי לטעון את היומן. אנסה שוב בעוד רגע.'); } finally { setLoading(false); }
  }, [range]);
  useEffect(() => { setLoading(true); void load(); }, [load]);
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 15_000);
    return () => clearInterval(t);
  }, [live, load]);

  const shown = useMemo(() => (feed?.events ?? []).filter((e) =>
    (cat === 'all' || e.category === cat) && (status === 'all' || e.status === status) &&
    (!q || `${e.title} ${e.why} ${e.event} ${Object.values(e.detail).join(' ')}`.toLowerCase().includes(q.toLowerCase()))), [feed, cat, status, q]);

  const parts = [cat !== 'all' ? CATS.find((c) => c[0] === cat)?.[1] : null, status !== 'all' ? STATUS[status].label : null].filter(Boolean) as string[];
  const sm = feed?.summary;
  const top = feed?.anomalies[0];

  return (
    <div className="flex flex-col gap-8">
      {top ? (
        <Glass glow="failed" className="flex items-start gap-3 overflow-hidden bg-gradient-to-l from-rose-500/[0.08] to-transparent px-5 py-4">
          <Stripe status="failed" />
          <Dot status="failed" pulse />
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-medium text-slate-900 dark:text-cream">{top.title}</div>
            <div className="mt-0.5 text-[13px] text-slate-500">{top.why} {top.todo}</div>
            {feed!.anomalies.length > 1 ? <div className="mt-1 text-[12px] text-slate-500">ועוד {feed!.anomalies.length - 1} חריגות</div> : null}
          </div>
          <Link prefetch={false} href="/ops/ceo/security" className="shrink-0 text-[13px] font-medium text-slate-800 underline underline-offset-4 dark:text-cream">מכשירים</Link>
        </Glass>
      ) : null}

      <Metrics items={[
        { label: 'אירועים', value: sm?.total ?? '—' },
        { label: 'כישלונות', value: sm?.byStatus.failed ?? '—', status: 'failed', sub: sm ? `${Math.round(sm.failRate * 100)}% · רגיל ${Math.round(sm.baselineFailRate * 100)}%` : undefined },
        { label: 'אבטחה', value: sm?.byStatus.security ?? '—', status: 'security' },
        { label: 'ממתינים', value: sm?.byStatus.pending ?? '—', status: 'pending' },
      ]} />

      <Section title={view === 'feed' ? 'אירועים' : 'סיפורי כניסה'} aside={<Segmented value={view} options={[['feed', 'אירועים'], ['stories', 'סיפורים']]} onChange={setView} />}>
        <div className="flex flex-col gap-3">
          <SearchBar value={q} onChange={setQ} placeholder="חיפוש ביומן" onFilters={sheet.show} activeCount={parts.length}
            trailing={<button type="button" onClick={() => setLive(!live)} aria-pressed={live} title={live ? 'עדכון חי פעיל' : 'עדכון חי מושהה'} className="flex h-10 items-center gap-1.5 rounded-xl px-2 text-[12px] text-slate-500"><Dot status={live ? 'success' : 'info'} pulse={live} />{live ? 'חי' : 'מושהה'}</button>} />
          <div className="flex items-center justify-between gap-2">
            <Segmented value={range} options={RANGES} onChange={setRange} />
            <button type="button" onClick={() => void load()} aria-label="רענון" className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:text-slate-700"><RefreshCw size={15} /></button>
          </div>
          <ActiveFilters parts={parts} onClear={() => { setCat('all'); setStatus('all'); }} />
        </div>

        {loading && !feed ? <Skeleton /> : err && !feed ? <Glass><Empty title={err} /></Glass> : (
          <Glass className="overflow-hidden">
            {view === 'stories'
              ? (feed?.stories.length ? <ul className="divide-y divide-black/[0.05] dark:divide-cream/10">{feed.stories.map((s) => <StoryRow key={s.id} s={s} />)}</ul> : <Empty title="אין סיפורי כניסה בטווח הזה" />)
              : (shown.length ? <ul className="divide-y divide-black/[0.05] dark:divide-cream/10">{shown.map((e) => <EventRow key={e.id} e={e} />)}</ul> : <Empty title="שקט כאן" sub="אין אירועים שמתאימים לסינון." />)}
          </Glass>
        )}
        {err && feed ? <p className="px-1 text-[12px] text-rose-700">{err}</p> : null}
      </Section>

      <Sheet open={sheet.open} onClose={sheet.hide} title="סינון">
        <OptionGroup label="סטטוס" value={status} options={STATUSES} onChange={setStatus} />
        <OptionGroup label="קטגוריה" value={cat} options={CATS as [string, string][]} onChange={setCat} />
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={sheet.hide} className="flex-1 rounded-xl bg-slate-900 py-2.5 text-[14px] font-medium text-cream dark:bg-cream dark:text-slate-900">הצג {shown.length} תוצאות</button>
          <button type="button" onClick={() => { setCat('all'); setStatus('all'); }} className="rounded-xl px-4 py-2.5 text-[14px] text-slate-600">נקה</button>
        </div>
      </Sheet>
    </div>
  );
}
