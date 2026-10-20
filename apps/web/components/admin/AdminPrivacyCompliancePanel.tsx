'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ChevronDown, Circle, Clock, Download, ExternalLink, FileText, Loader2, Lock, AlertTriangle, Users, Search, X, SearchX } from 'lucide-react';
import { opsGlassBtnClass, opsGlassCardClass } from '@/components/admin/OpsPanel';
import { cn } from '@/lib/cn';
import {
  COMPLIANCE_DOCS, COMPLIANCE_ITEMS, THRESHOLDS, itemState, rowDone, yearlyDue,
  type AutoFacts, type ComplianceItem, type ComplianceRow, type ItemState,
} from '@/lib/privacy/compliance-checklist';

type Data = { rows: ComplianceRow[]; facts: AutoFacts; drillMeta: Record<string, unknown>; lastUpdated: string | null; docs: { slug: string; updated_at: string }[] };

const fmt = (iso: string | null | undefined) =>
  iso ? new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', day: 'numeric', month: 'numeric', year: 'numeric' }).format(new Date(iso)) : '—';

const STATE: Record<ItemState, { label: string; cls: string; Icon: typeof Circle }> = {
  done: { label: 'הושלם', cls: 'border-emerald-300/60 bg-emerald-500/15 text-emerald-800', Icon: CheckCircle2 },
  partial: { label: 'בתהליך', cls: 'border-amber-300/60 bg-amber-400/15 text-amber-800', Icon: Clock },
  open: { label: 'פתוח', cls: 'border-gc/60 bg-background-card/40 text-slate-700', Icon: Circle },
  overdue: { label: 'דורש טיפול', cls: 'border-rose-300/60 bg-rose-500/10 text-rose-800', Icon: AlertTriangle },
};

function Badge({ s }: { s: ItemState }) {
  const { label, cls, Icon } = STATE[s];
  return <span className={cn('inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold', cls)}><Icon size={13} />{label}</span>;
}

function Toggle({ checked, label, busy, onChange }: { checked: boolean; label: string; busy: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className={cn('flex min-h-11 cursor-pointer items-center gap-3 rounded-2xl border px-3 py-2 text-sm transition', checked ? 'border-emerald-300/60 bg-emerald-500/10' : 'border-gc/50 bg-background-card/30 hover:bg-background-card/50')}>
      <input type="checkbox" className="peer sr-only" checked={checked} disabled={busy} onChange={(e) => onChange(e.target.checked)} />
      <span aria-hidden className={cn('grid size-5 shrink-0 place-items-center rounded-md border transition peer-focus-visible:ring-2 peer-focus-visible:ring-emerald-400/50', checked ? 'border-emerald-500 bg-emerald-500 text-background-card' : 'border-slate-300 bg-background-card/60')}>
        {busy ? <Loader2 size={12} className="animate-spin" /> : checked ? '✓' : null}
      </span>
      <span className={cn('font-semibold', checked ? 'text-emerald-900' : 'text-slate-800')}>{label}</span>
    </label>
  );
}

function ItemCard({ n, item, data, rows, busy, set }: { n: number; item: ComplianceItem; data: Data; rows: Map<string, ComplianceRow>; busy: string | null; set: (k: string, v: boolean) => void }) {
  const state = itemState(item, rows, data.facts);
  const [open, setOpen] = useState(false);
  const row = rows.get(item.key);
  const u = data.facts.userCount;
  const due = item.yearly ? `עד ${yearlyDue()}` : item.everyMonths ? `כל ${item.everyMonths} חודשים` : row?.done_at && !item.auto ? `סומן ${fmt(row.done_at)}` : item.auto ? 'אוטומטי' : null;
  const pid = `pc-${item.key}`;
  return (
    <div className={cn('transition-colors', open && 'bg-background-card/30')}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls={pid} className="flex min-h-14 w-full items-center gap-3 px-4 py-3.5 text-start transition hover:bg-background-card/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-400/50 sm:px-5">
        <span className={cn('grid size-8 shrink-0 place-items-center rounded-xl font-display text-xs font-black shadow-sm', state === 'done' ? 'bg-emerald-500/15 text-emerald-700' : 'bg-gradient-to-br from-emerald-500 to-teal-600 text-background-card shadow-emerald-600/30')}>{String(n).padStart(2, '0')}</span>
        <span className="min-w-0 flex-1">
          <span className={cn('block font-display text-[15px] font-bold leading-snug', state === 'done' ? 'text-slate-600' : 'text-slate-900')}>{item.title}</span>
          {due ? <span className="mt-0.5 block text-[11px] font-semibold text-slate-500">{due}</span> : null}
        </span>
        <Badge s={state} />
        <ChevronDown size={18} aria-hidden className={cn('shrink-0 text-slate-400 transition-transform duration-200', open && 'rotate-180')} />
      </button>
      {open ? (
        <div id={pid} className="space-y-4 px-4 pb-5 pt-1 sm:px-5 sm:ps-16">
          <div className="rounded-2xl border border-amber-300/40 bg-amber-50/40 px-3.5 py-3"><p className="text-[11px] font-black tracking-wide text-amber-700">למה זה חשוב</p><p className="mt-1 text-sm leading-relaxed text-slate-700">{item.why}</p></div>
          <p className="text-[11px] font-black tracking-wide text-emerald-700">איך עושים</p>
          <ol className="-mt-2 list-decimal space-y-1.5 ps-5 text-sm leading-relaxed text-slate-700 marker:font-bold marker:text-emerald-600">{item.how.map((h) => <li key={h}>{h}</li>)}</ol>

          {item.auto === 'thresholds' ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {[{ at: THRESHOLDS.dpo, l: 'בדיקה חוזרת של ממונה פרטיות' }, { at: THRESHOLDS.ppaNotice, l: 'הודעה לרשות להגנת הפרטיות' }].map((t) => {
                const pct = Math.min(100, (u / t.at) * 100);
                return (
                  <div key={t.at} className="rounded-2xl border border-gc/50 bg-background-card/30 p-3">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-700"><span className="inline-flex items-center gap-1"><Users size={13} />{t.l}</span><span dir="ltr">{u.toLocaleString('he-IL')} / {t.at.toLocaleString('he-IL')}</span></div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200/60"><div className={cn('h-full rounded-full', u >= t.at ? 'bg-rose-500' : 'bg-gradient-to-l from-amber-400 to-emerald-500')} style={{ width: `${Math.max(pct, 1.5)}%` }} /></div>
                  </div>
                );
              })}
            </div>
          ) : null}
          {item.auto === 'access_log' ? <p className="rounded-2xl border border-emerald-300/50 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-900">{data.facts.auditEvents30d.toLocaleString('he-IL')} פעולות נרשמו ב־30 הימים האחרונים</p> : null}
          {item.auto === 'backup_drill' ? (
            <div className="rounded-2xl border border-gc/50 bg-background-card/30 px-3 py-2 text-xs leading-relaxed text-slate-700">
              {data.facts.drill ? (
                <>תרגול אחרון: <b>{fmt(data.facts.drill.at)}</b> · {data.facts.drill.ok ? 'הצליח' : 'נכשל'}
                  {typeof data.drillMeta.tables === 'number' ? ` · ${data.drillMeta.tables} טבלאות, ${Number(data.drillMeta.rows ?? 0).toLocaleString('he-IL')} שורות נבדקו` : ''}
                  {typeof data.drillMeta.plan === 'string' ? <><br />תוכנית: {String(data.drillMeta.plan)} · גיבוי יומי: {data.drillMeta.daily_backups ? 'כן' : 'לא'} · שחזור לנקודת זמן: {data.drillMeta.pitr ? 'כן' : 'לא'}</> : null}
                </>
              ) : 'עוד לא רץ תרגול שחזור.'}
            </div>
          ) : null}

          {item.subs ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {item.subs.map((s) => {
                const k = `${item.key}:${s.key}`;
                return (
                  <div key={k} className="flex items-center gap-1">
                    <div className="flex-1"><Toggle checked={rowDone(item, rows.get(k))} busy={busy === k} label={s.label} onChange={(v) => set(k, v)} /></div>
                    {s.href ? <a href={s.href} target="_blank" rel="noopener noreferrer" className="grid size-11 shrink-0 place-items-center rounded-2xl text-slate-500 hover:bg-background-card/50 hover:text-emerald-700" aria-label={`פתיחת ההסכם של ${s.label}`}><ExternalLink size={16} /></a> : null}
                  </div>
                );
              })}
            </div>
          ) : !item.auto ? (
            <Toggle checked={rowDone(item, row)} busy={busy === item.key} label={item.ack ?? 'בוצע'} onChange={(v) => set(item.key, v)} />
          ) : null}

          {item.links?.length ? (
            <div className="flex flex-wrap gap-2">{item.links.map((l) => (
              <a key={l.href} href={l.href} target={l.href.startsWith('/api/') ? '_blank' : undefined} rel="noopener noreferrer" className={opsGlassBtnClass}>
                {l.href.startsWith('/api/') ? <FileText size={14} /> : <ExternalLink size={14} />}{l.label}
              </a>
            ))}</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function AdminPrivacyCompliancePanel() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [openSec, setOpenSec] = useState<Set<number>>(() => new Set([1]));
  const toggleSec = (n: number) => setOpenSec((o) => { const x = new Set(o); if (x.has(n)) x.delete(n); else x.add(n); return x; });

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/admin/privacy-compliance', { credentials: 'include', cache: 'no-store' });
      if (!res.ok) throw new Error('הטעינה נכשלה');
      setData((await res.json()) as Data);
    } catch (e) { setError(e instanceof Error ? e.message : 'שגיאה'); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const rows = useMemo(() => new Map((data?.rows ?? []).map((r) => [r.item_key, r])), [data]);

  const set = async (key: string, done: boolean) => {
    setBusy(key); setError(null);
    try {
      const res = await fetch('/api/v1/admin/privacy-compliance', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, done }) });
      if (!res.ok) throw new Error('השמירה נכשלה, נסה שוב');
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'שגיאה'); } finally { setBusy(null); }
  };

  if (!data) return <div className={cn(opsGlassCardClass, 'flex items-center justify-center gap-2 py-10 text-sm text-slate-600')}>{error ?? <><Loader2 size={16} className="animate-spin" />טוען…</>}</div>;

  const states = COMPLIANCE_ITEMS.map((i) => itemState(i, rows, data.facts));
  const done = states.filter((s) => s === 'done').length;
  const high = COMPLIANCE_ITEMS.filter((i) => i.group === 'high');
  const have = new Set(data.docs.map((d) => d.slug));

  const owner = COMPLIANCE_ITEMS.filter((i) => i.group === 'owner' && i.auto !== 'thresholds');
  const thr = COMPLIANCE_ITEMS.find((i) => i.auto === 'thresholds');
  const count = (k: ItemState) => states.filter((s) => s === k).length;
  const u = data.facts.userCount;
  const needle = q.trim().toLowerCase();
  const searching = needle.length > 0 || filter !== 'all';
  const passState = (st: ItemState) => filter === 'all' || (filter === 'open' ? st === 'open' || st === 'partial' : st === filter);
  const passText = (t: string) => !needle || t.toLowerCase().includes(needle);
  const itemMatch = (it: ComplianceItem) => passState(itemState(it, rows, data.facts)) && passText([it.title, it.why, ...it.how, ...(it.subs ?? []).map((x) => x.label)].join(' '));
  const ownerF = owner.filter(itemMatch);
  const highF = high.filter(itemMatch);
  const thrShow = thr ? itemMatch(thr) || (!searching) : false;
  const docsF = filter === 'all' || filter === 'done' ? COMPLIANCE_DOCS.filter((d) => passText(`${d.slug} ${d.title}`) && (filter === 'all' || have.has(`${d.slug}.pdf`) || have.has(`${d.slug}.docx`))) : [];
  const total = ownerF.length + highF.length + (thrShow && thr ? 1 : 0) + docsF.length;
  const secOpen = (n: number, hits: number) => (searching ? hits > 0 : openSec.has(n));
  const chipsFor = (list: ComplianceItem[]) => {
    const st = list.map((it) => itemState(it, rows, data.facts));
    const d = st.filter((x) => x === 'done').length, od = st.filter((x) => x === 'overdue').length;
    return <>{od ? <MiniChip k="overdue" n={od} /> : null}<span className="rounded-full border border-gc/50 bg-background-card/50 px-2 py-0.5 text-[11px] font-black text-slate-600" dir="ltr">{d}/{st.length}</span></>;
  };
  const FILTERS: { k: Filter; l: string }[] = [{ k: 'all', l: 'הכול' }, { k: 'open', l: 'פתוח' }, { k: 'overdue', l: 'באיחור' }, { k: 'done', l: 'בוצע' }];

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-10">
      <div className="sticky top-2 z-20 -mx-1 rounded-3xl border border-white/60 bg-background-card/70 p-2.5 shadow-lg shadow-slate-900/5 backdrop-blur-xl">
        <label className="relative block">
          <span className="sr-only">חיפוש במשימות ובמסמכים</span>
          <Search size={16} aria-hidden className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש משימה או מסמך…" className="h-11 w-full rounded-2xl border border-gc/50 bg-background-card/80 pe-10 ps-10 text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/30 [&::-webkit-search-cancel-button]:hidden" />
          {q ? <button type="button" onClick={() => setQ('')} aria-label="ניקוי החיפוש" className="absolute end-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-xl text-slate-500 hover:bg-slate-100"><X size={15} /></button> : null}
        </label>
        <div role="radiogroup" aria-label="סינון לפי סטטוס" className="mt-2 flex gap-1.5 overflow-x-auto">
          {FILTERS.map((f) => (
            <button key={f.k} type="button" role="radio" aria-checked={filter === f.k} onClick={() => setFilter(f.k)} className={cn('h-9 shrink-0 rounded-full border px-3.5 text-xs font-bold transition', filter === f.k ? 'border-emerald-500 bg-gradient-to-br from-emerald-500 to-teal-600 text-background-card shadow-md shadow-emerald-600/25' : 'border-gc/50 bg-background-card/60 text-slate-600 hover:bg-background-card')}>{f.l}</button>
          ))}
          {searching ? <span className="ms-auto self-center whitespace-nowrap ps-2 text-[11px] font-semibold text-slate-500">{total} תוצאות</span> : null}
        </div>
      </div>
      <Group n={1} open={searching ? false : openSec.has(1)} hidden={searching} onToggle={toggleSec} chips={<span className="rounded-full border border-emerald-300/60 bg-emerald-500/15 px-2 py-0.5 text-[11px] font-black text-emerald-800" dir="ltr">{done}/{states.length}</span>} title="סיכום התקדמות" sub="הסטטוס נשמר ומתעדכן אוטומטית. כל סימון נרשם ביומן הפעולות">
        <div className={cn(opsGlassCardClass, 'space-y-4')}>
          <div className="flex items-center gap-4">
            <div className="relative grid size-20 shrink-0 place-items-center rounded-full shadow-lg shadow-emerald-600/15" style={{ background: `conic-gradient(#10b981 ${(done / states.length) * 360}deg, rgba(148,163,184,.22) 0)` }}>
              <div className="grid size-[62px] place-items-center rounded-full bg-background-card"><span className="font-display text-lg font-black text-slate-900" dir="ltr">{done}/{states.length}</span></div>
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-display text-lg font-black text-slate-900">{done === states.length ? 'הכול מסודר' : `נשארו ${states.length - done} משימות`}</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-600">גדעון יזכיר לך פעם בחודש על מה שפתוח.</p>
              <p className="mt-1 text-[11px] font-semibold text-slate-500">עדכון אחרון: {fmt(data.lastUpdated)}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 border-t border-gc/40 pt-4 sm:grid-cols-4">
            {(['done', 'partial', 'open', 'overdue'] as const).map((k) => {
              const { label, cls, Icon } = STATE[k];
              return <div key={k} className={cn('flex items-center justify-between rounded-2xl border px-3 py-2', cls)}><span className="inline-flex items-center gap-1.5 text-xs font-bold"><Icon size={14} />{label}</span><span className="font-display text-base font-black">{count(k)}</span></div>;
            })}
          </div>
        </div>
      </Group>
      {error ? <p role="alert" className="rounded-2xl border border-rose-300/50 bg-rose-500/10 px-3 py-2 text-sm font-semibold text-rose-800">{error}</p> : null}

      <Group n={2} open={secOpen(2, ownerF.length)} hidden={searching && !ownerF.length} onToggle={toggleSec} chips={chipsFor(owner)} title="המשימות שלך" sub="מה שרק בעל המאגר יכול לעשות. לחיצה על שורה פותחת הסבר">
        <div className={cn(opsGlassCardClass, 'divide-y divide-gc/40 overflow-hidden p-0 sm:p-0')}>
          {ownerF.map((it) => <ItemCard key={it.key} n={owner.indexOf(it) + 1} item={it} data={data} rows={rows} busy={busy} set={set} />)}
        </div>
      </Group>

      <Group n={3} open={secOpen(3, highF.length)} hidden={searching && !highF.length} onToggle={toggleSec} chips={chipsFor(high)} title="דרישות לרמת האבטחה הגבוהה" sub="לא חובה ברמה הנוכחית. מומלץ לקראת ההשקה או כשמספר המשתמשים יגדל">
        <div className={cn(opsGlassCardClass, 'divide-y divide-gc/40 overflow-hidden p-0 sm:p-0')}>
          {highF.map((it) => <ItemCard key={it.key} n={owner.length + high.indexOf(it) + 1} item={it} data={data} rows={rows} busy={busy} set={set} />)}
        </div>
      </Group>

      {thr ? (
        <Group n={4} open={secOpen(4, thrShow ? 1 : 0)} hidden={searching && !thrShow} onToggle={toggleSec} chips={<Badge s={itemState(thr, rows, data.facts)} />} title="ספי משתמשים" sub={`${u.toLocaleString('he-IL')} משתמשים כרגע. ${thr.why}`}>
          <div className="grid gap-3 sm:grid-cols-2">
            {[{ at: THRESHOLDS.dpo, l: 'בדיקה חוזרת של ממונה פרטיות' }, { at: THRESHOLDS.ppaNotice, l: 'הודעה לרשות להגנת הפרטיות' }].map((t) => {
              const pct = Math.min(100, (u / t.at) * 100);
              return (
                <div key={t.at} className={cn(opsGlassCardClass, 'space-y-3')}>
                  <div className="flex items-start justify-between gap-2"><span className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-800"><Users size={15} className="text-emerald-600" />{t.l}</span><Badge s={u >= t.at ? 'overdue' : 'done'} /></div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-slate-200/60"><div className={cn('h-full rounded-full', u >= t.at ? 'bg-rose-500' : 'bg-gradient-to-l from-amber-400 to-emerald-500')} style={{ width: `${Math.max(pct, 1.5)}%` }} /></div>
                  <p className="text-xs font-semibold text-slate-500" dir="ltr" style={{ textAlign: 'end' }}>{u.toLocaleString('he-IL')} / {t.at.toLocaleString('he-IL')}</p>
                </div>
              );
            })}
          </div>
        </Group>
      ) : null}

      <Group n={thr ? 5 : 4} open={secOpen(thr ? 5 : 4, docsF.length)} hidden={searching && !docsF.length} onToggle={toggleSec} chips={<span className="rounded-full border border-gc/50 bg-background-card/50 px-2 py-0.5 text-[11px] font-black text-slate-600">{COMPLIANCE_DOCS.length} מסמכים</span>} title="המסמכים" sub="נפתחים רק לך, אחרי בדיקת הרשאה בשרת. מסמך 06 חסוי">
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-3">
          {docsF.map((d) => (
            <div key={d.slug} className={cn(opsGlassCardClass, 'flex flex-col gap-3 p-3.5 sm:p-4')}>
              <div className="flex items-start gap-2.5">
                <span className={cn('grid size-9 shrink-0 place-items-center rounded-xl', d.sensitive ? 'bg-amber-400/15 text-amber-700' : 'bg-emerald-500/10 text-emerald-700')}>{d.sensitive ? <Lock size={16} /> : <FileText size={16} />}</span>
                <div className="min-w-0 flex-1"><p className="font-display text-[11px] font-black text-slate-400" dir="ltr" style={{ textAlign: 'start' }}>{d.slug.slice(0, 2)}</p><p className="text-sm font-bold leading-snug text-slate-900">{d.title}</p></div>
              </div>
              <div className="mt-auto flex gap-2">
                {(['pdf', 'docx'] as const).map((ext) => have.has(`${d.slug}.${ext}`) ? (
                  <a key={ext} href={`/api/v1/admin/privacy-compliance/docs/${d.slug}.${ext}`} target="_blank" rel="noopener noreferrer" className={cn(opsGlassBtnClass, 'min-w-0 flex-1 justify-center px-2')}><Download size={13} />{ext === 'pdf' ? 'PDF' : 'Word'}</a>
                ) : null)}
              </div>
            </div>
          ))}
        </div>
      </Group>
      {searching && total === 0 ? (
        <div className={cn(opsGlassCardClass, 'flex flex-col items-center gap-3 py-12 text-center')}>
          <span className="grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-amber-200/70 to-emerald-200/60 text-emerald-700 shadow-inner"><SearchX size={24} /></span>
          <p className="font-display text-base font-black text-slate-900">לא מצאתי כלום</p>
          <p className="max-w-xs text-xs leading-relaxed text-slate-500">נסה מילה אחרת או סינון אחר.</p>
          <button type="button" onClick={() => { setQ(''); setFilter('all'); }} className={opsGlassBtnClass}>ניקוי החיפוש</button>
        </div>
      ) : null}
    </div>
  );
}

type Filter = 'all' | 'open' | 'overdue' | 'done';

function MiniChip({ k, n }: { k: ItemState; n: number }) {
  const { cls, Icon } = STATE[k];
  return <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-black', cls)}><Icon size={12} />{n}</span>;
}

function Group({ n, title, sub, open, hidden, onToggle, chips, children }: { n: number; title: string; sub: string; open: boolean; hidden?: boolean; onToggle: (n: number) => void; chips?: React.ReactNode; children: React.ReactNode }) {
  if (hidden) return null;
  return (
    <section className="space-y-4" aria-labelledby={`pg-${n}`}>
      <button type="button" onClick={() => onToggle(n)} aria-expanded={open} aria-controls={`pgb-${n}`} className="group flex w-full items-center gap-3 rounded-2xl text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50">
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl border border-amber-300/60 bg-gradient-to-br from-amber-200/70 to-amber-400/40 font-display text-sm font-black text-amber-900 shadow-sm shadow-amber-500/20">{String(n).padStart(2, '0')}</span>
        <span className="min-w-0 flex-1">
          <span id={`pg-${n}`} className="block font-display text-base font-black text-slate-900 sm:text-lg">{title}</span>
          <span className="block text-xs leading-relaxed text-slate-500">{sub}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5">{chips}</span>
        <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-background-card/50 text-slate-500 transition group-hover:bg-background-card"><ChevronDown size={17} aria-hidden className={cn('transition-transform duration-200', open && 'rotate-180')} /></span>
      </button>
      <div aria-hidden className="h-px bg-gradient-to-l from-amber-400/70 via-emerald-400/40 to-transparent" />
      {open ? <div id={`pgb-${n}`}>{children}</div> : null}
    </section>
  );
}
