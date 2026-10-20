'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ChevronDown, Circle, Clock, Download, ExternalLink, FileText, Loader2, Lock, AlertTriangle, Users } from 'lucide-react';
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

  return (
    <div className="mx-auto max-w-3xl space-y-10 pb-10">
      <Group n={1} title="סיכום התקדמות" sub="הסטטוס נשמר ומתעדכן אוטומטית. כל סימון נרשם ביומן הפעולות">
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

      <Group n={2} title="המשימות שלך" sub="מה שרק בעל המאגר יכול לעשות. לחיצה על שורה פותחת הסבר">
        <div className={cn(opsGlassCardClass, 'divide-y divide-gc/40 overflow-hidden p-0 sm:p-0')}>
          {owner.map((it, i) => <ItemCard key={it.key} n={i + 1} item={it} data={data} rows={rows} busy={busy} set={set} />)}
        </div>
      </Group>

      <Group n={3} title="דרישות לרמת האבטחה הגבוהה" sub="לא חובה ברמה הנוכחית. מומלץ לקראת ההשקה או כשמספר המשתמשים יגדל">
        <div className={cn(opsGlassCardClass, 'divide-y divide-gc/40 overflow-hidden p-0 sm:p-0')}>
          {high.map((it, i) => <ItemCard key={it.key} n={owner.length + i + 1} item={it} data={data} rows={rows} busy={busy} set={set} />)}
        </div>
      </Group>

      {thr ? (
        <Group n={4} title="ספי משתמשים" sub={`${u.toLocaleString('he-IL')} משתמשים כרגע. ${thr.why}`}>
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

      <Group n={thr ? 5 : 4} title="המסמכים" sub="נפתחים רק לך, אחרי בדיקת הרשאה בשרת. מסמך 06 חסוי">
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-3">
          {COMPLIANCE_DOCS.map((d) => (
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
    </div>
  );
}

function Group({ n, title, sub, children }: { n: number; title: string; sub: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4" aria-labelledby={`pg-${n}`}>
      <div className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl border border-amber-300/60 bg-gradient-to-br from-amber-200/70 to-amber-400/40 font-display text-sm font-black text-amber-900 shadow-sm shadow-amber-500/20">{String(n).padStart(2, '0')}</span>
        <div className="min-w-0 flex-1">
          <h2 id={`pg-${n}`} className="font-display text-base font-black text-slate-900 sm:text-lg">{title}</h2>
          <p className="text-xs leading-relaxed text-slate-500">{sub}</p>
        </div>
      </div>
      <div aria-hidden className="h-px bg-gradient-to-l from-amber-400/70 via-emerald-400/40 to-transparent" />
      {children}
    </section>
  );
}
