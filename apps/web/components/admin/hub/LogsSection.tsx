'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Database, Download, Eye, EyeOff, Loader2, RotateCw, Search, ShieldAlert } from 'lucide-react';
import { IncidentSheet } from './IncidentSheet';
import { opsGlassCardClass } from '@/components/admin/OpsPanel';
import { cn } from '@/lib/cn';
import { LOG_TYPE_HE, type LogInv, type LogRow, type LogType } from '@/lib/logs/query';

type StorageType = { table: string; label: string; klass: 'operational' | 'access' | 'legal'; klass_he: string; retention_he: string; bytes: number; rows: number };
type Storage = { db_bytes: number; limit_bytes: number; level: 'ok' | 'warn' | 'critical'; last_run: { created_at: string; dry_run: boolean } | null; types: StorageType[] };
type Page = { rows: LogRow[]; total: number; page: number; pageSize: number };

const TYPES = Object.keys(LOG_TYPE_HE) as LogType[];
const mb = (b: number) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)}MB` : `${Math.max(1, Math.round(b / 1024))}KB`);
const when = (iso: string) => new Date(iso).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });
const LEVEL_CLS = { ok: 'bg-emerald-500', warn: 'bg-amber-500', critical: 'bg-rose-500' } as const;
const CLASS_CHIP = { operational: 'border-teal-300/60 bg-teal-500/10 text-teal-800', access: 'border-indigo-300/60 bg-indigo-500/10 text-indigo-800', legal: 'border-amber-300/70 bg-amber-500/15 text-amber-800' } as const;
const input = 'min-w-0 rounded-xl border border-slate-200/80 bg-white/70 px-3 py-2 text-[13px] text-slate-800 outline-none focus:border-teal-400';

function ErrorCard({ text, onRetry }: { text: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex items-center justify-between gap-3 rounded-2xl border border-rose-300/60 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-800">
      {text}
      <button type="button" onClick={onRetry} className="inline-flex items-center gap-1 rounded-xl border border-rose-400/40 px-3 py-1.5 text-[13px]"><RotateCw size={14} />לנסות שוב</button>
    </div>
  );
}

function StoragePanel() {
  const [s, setS] = useState<Storage | null>(null);
  const [err, setErr] = useState(false);
  const load = useCallback(() => {
    fetch('/api/v1/ops/legal/logs/storage', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : Promise.reject())).then((d: Storage) => { setS(d); setErr(false); }).catch(() => setErr(true));
  }, []);
  useEffect(() => { load(); }, [load]);
  if (err && !s) return <ErrorCard text="לא הצלחנו לטעון את נתוני הנפח." onRetry={load} />;
  if (!s) return <div className={cn(opsGlassCardClass, 'grid place-items-center p-8')} data-testid="logs-storage-loading"><Loader2 className="animate-spin text-slate-400" /></div>;
  const pct = Math.min(100, (s.db_bytes / s.limit_bytes) * 100);
  return (
    <div className={cn(opsGlassCardClass, 'space-y-3 p-4')} data-testid="logs-storage">
      <div className="flex items-center gap-2 text-sm font-bold text-slate-800"><Database size={16} className="text-teal-600" />נפח מסד הנתונים</div>
      <div>
        <div className="flex justify-between text-[13px] text-slate-600"><span>{mb(s.db_bytes)} מתוך {mb(s.limit_bytes)} (חינמי)</span><span>{pct.toFixed(1)}%</span></div>
        <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-200/70"><div className={cn('h-full rounded-full', LEVEL_CLS[s.level])} style={{ width: `${Math.max(pct, 1)}%` }} /></div>
        <p className="mt-1 text-[12px] text-slate-500">התראה נשלחת אליך ב-70% ו-85%. ניקוי אוטומטי כל לילה{s.last_run ? ` · ריצה אחרונה ${when(s.last_run.created_at)}` : ' · עדיין לא רץ'}.</p>
      </div>
      <ul className="divide-y divide-slate-200/60 text-[13px]">
        {s.types.map((t) => (
          <li key={t.table} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span className="font-semibold text-slate-700">{t.label}</span>
            <span className="flex flex-wrap items-center gap-2 text-slate-500">
              <span>{t.rows.toLocaleString('he-IL')} שורות · {mb(t.bytes)}</span>
              <span className={cn('rounded-full border px-2 py-0.5 text-[11px] font-semibold', CLASS_CHIP[t.klass])} title={t.klass_he}>שמירה: {t.retention_he}{t.klass === 'legal' ? ' · לא נמחק אוטומטית' : ''}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Ops → אבטחה ופרטיות → יומנים. */
export function LogsSection() {
  const [type, setType] = useState<LogType>('admin');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [actor, setActor] = useState('');
  const [result, setResult] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [reveal, setReveal] = useState(false);
  const [data, setData] = useState<Page | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(false);
  const [investigating, setInvestigating] = useState<LogInv | null>(null);

  const params = useCallback((extra: Record<string, string> = {}) => {
    const p = new URLSearchParams({ type, page: String(page), ...extra });
    if (from) p.set('from', new Date(`${from}T00:00:00`).toISOString());
    if (to) p.set('to', new Date(`${to}T23:59:59`).toISOString());
    if (actor.trim()) p.set('actor', actor.trim());
    if (result.trim()) p.set('result', result.trim());
    if (q.trim()) p.set('q', q.trim());
    if (reveal) p.set('reveal', '1');
    return p;
  }, [type, page, from, to, actor, result, q, reveal]);

  const load = useCallback(() => {
    setLoading(true); setErr(false);
    fetch(`/api/v1/ops/legal/logs?${params()}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: Page) => setData(d))
      .catch(() => setErr(true))
      .finally(() => setLoading(false));
  }, [params]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const reset = (fn: () => void) => { fn(); setPage(1); };

  return (
    <div className="space-y-4" dir="rtl" data-testid="logs-section">
      <StoragePanel />
      <div className={cn(opsGlassCardClass, 'space-y-3 p-4')}>
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="סוג יומן">
          {TYPES.map((t) => (
            <button key={t} type="button" role="tab" aria-selected={type === t} onClick={() => reset(() => { setType(t); setResult(''); })}
              className={cn('rounded-full border px-3 py-1 text-[12px] font-semibold', type === t ? 'border-teal-400 bg-teal-500/15 text-teal-800' : 'border-slate-200/80 text-slate-600')}>{LOG_TYPE_HE[t]}</button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <label className="relative col-span-2 sm:col-span-3 lg:col-span-2"><Search size={14} className="absolute right-3 top-2.5 text-slate-400" /><input aria-label="חיפוש" placeholder="חיפוש" value={q} onChange={(e) => reset(() => setQ(e.target.value))} className={cn(input, 'w-full pr-8')} /></label>
          <input aria-label="מתאריך" type="date" value={from} onChange={(e) => reset(() => setFrom(e.target.value))} className={input} />
          <input aria-label="עד תאריך" type="date" value={to} onChange={(e) => reset(() => setTo(e.target.value))} className={input} />
          <input aria-label="מבצע" placeholder="מבצע (מזהה)" value={actor} onChange={(e) => reset(() => setActor(e.target.value))} className={input} />
          <input aria-label="תוצאה" placeholder="תוצאה / סוג" value={result} onChange={(e) => reset(() => setResult(e.target.value))} className={input} />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button type="button" onClick={() => setReveal((v) => !v)} aria-pressed={reveal} className="inline-flex items-center gap-1 rounded-xl border border-slate-200/80 px-3 py-1.5 text-[12px] font-semibold text-slate-700">
            {reveal ? <EyeOff size={14} /> : <Eye size={14} />}{reveal ? 'הסתר פרטים אישיים' : 'הצג פרטים מלאים (נרשם ביומן)'}
          </button>
          <a href={`/api/v1/ops/legal/logs/export?${params({ page: '1' })}`} className="inline-flex items-center gap-1 rounded-xl border border-teal-400/50 bg-teal-500/10 px-3 py-1.5 text-[12px] font-semibold text-teal-800" download>
            <Download size={14} />ייצוא CSV
          </a>
        </div>

        {err && !loading ? <ErrorCard text="לא הצלחנו לטעון את היומן." onRetry={load} /> : null}
        {loading && !data ? <div className="grid place-items-center p-8" data-testid="logs-loading"><Loader2 className="animate-spin text-slate-400" /></div> : null}
        {data ? (
          <div className={cn('space-y-2', loading && 'opacity-60')}>
            <p className="text-[12px] text-slate-500">{data.total.toLocaleString('he-IL')} רשומות{reveal ? '' : ' · פרטים אישיים מוסתרים'}</p>
            {data.rows.length === 0 ? <p className="py-6 text-center text-[13px] text-slate-500">אין רשומות בסינון הזה.</p> : (
              <ul className="divide-y divide-slate-200/60">
                {data.rows.map((r) => (
                  <li key={`${r.type}-${r.id}`} className="grid gap-0.5 py-2 text-[13px] sm:grid-cols-[8rem_1fr_auto] sm:items-baseline sm:gap-3">
                    <span className="text-[12px] tabular-nums text-slate-500" dir="ltr">{when(r.at)}</span>
                    <span className="min-w-0 break-words">
                      <span className="font-semibold text-slate-800">{r.action}</span>
                      {r.target ? <span className="text-slate-600" dir="ltr"> {r.target}</span> : null}
                      {r.detail ? <span className="block truncate text-[12px] text-slate-500" dir="ltr" title={r.detail}>{r.detail}</span> : null}
                    </span>
                    <span className="flex flex-wrap gap-2 text-[11px] text-slate-500" dir="ltr">
                      {r.actor ? <span>{r.actor}</span> : null}{r.ip ? <span>{r.ip}</span> : null}{r.country ? <span>{r.country}</span> : null}
                      {r.inv && (r.inv.user || r.inv.session || r.inv.ipHash) ? (
                        <button type="button" onClick={() => setInvestigating(r.inv!)} data-testid="log-investigate" dir="rtl"
                          className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-violet-300/60 bg-violet-500/10 px-2 text-[11.5px] font-semibold text-violet-800">
                          <ShieldAlert size={12} />חקירה וחסימה
                        </button>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex items-center justify-center gap-3 pt-1 text-[13px]">
              <button type="button" aria-label="הקודם" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-lg border border-slate-200/80 p-1.5 disabled:opacity-40"><ChevronRight size={16} /></button>
              <span className="tabular-nums text-slate-600">{page} / {pages}</span>
              <button type="button" aria-label="הבא" disabled={page >= pages} onClick={() => setPage((p) => p + 1)} className="rounded-lg border border-slate-200/80 p-1.5 disabled:opacity-40"><ChevronLeft size={16} /></button>
            </div>
          </div>
        ) : null}
      </div>
      {investigating ? <IncidentSheet inv={investigating} onClose={() => setInvestigating(null)} /> : null}
    </div>
  );
}
