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
  const [open, setOpen] = useState(state !== 'done');
  const row = rows.get(item.key);
  const u = data.facts.userCount;
  return (
    <section className={cn(opsGlassCardClass, 'p-0 sm:p-0')}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-start gap-3 p-4 text-start sm:p-5">
        <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-sm font-black text-background-card shadow-md shadow-emerald-600/30">{n}</span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-[15px] font-black leading-snug text-slate-900">{item.title}</span>
          <span className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-semibold text-slate-500">
            {item.yearly ? <span>מועד אחרון: {yearlyDue()}</span> : null}
            {item.everyMonths ? <span>כל {item.everyMonths} חודשים</span> : null}
            {row?.done_at && !item.auto ? <span>סומן ב־{fmt(row.done_at)}</span> : null}
          </span>
        </span>
        <Badge s={state} />
        <ChevronDown size={18} className={cn('mt-1 shrink-0 text-slate-400 transition', open && 'rotate-180')} />
      </button>
      {open ? (
        <div className="space-y-3 border-t border-gc/40 px-4 pb-4 pt-3 sm:px-5 sm:pb-5">
          <p className="text-sm leading-relaxed text-slate-700"><b className="text-slate-900">למה: </b>{item.why}</p>
          <ol className="list-decimal space-y-1 ps-5 text-sm leading-relaxed text-slate-700">{item.how.map((h) => <li key={h}>{h}</li>)}</ol>

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
    </section>
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
  const owner = COMPLIANCE_ITEMS.filter((i) => i.group === 'owner');
  const high = COMPLIANCE_ITEMS.filter((i) => i.group === 'high');
  const have = new Set(data.docs.map((d) => d.slug));

  return (
    <div className="space-y-6">
      <div className={cn(opsGlassCardClass, 'flex flex-wrap items-center gap-4')}>
        <div className="relative grid size-16 shrink-0 place-items-center rounded-full" style={{ background: `conic-gradient(#10b981 ${(done / states.length) * 360}deg, rgba(148,163,184,.25) 0)` }}>
          <div className="grid size-12 place-items-center rounded-full bg-background-card font-display text-sm font-black text-slate-900">{done}/{states.length}</div>
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-display text-base font-black text-slate-900">מה נשאר לך לעשות</p>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-600">הסטטוס נשמר ומתעדכן אוטומטית. כל סימון נרשם ביומן הפעולות. גדעון יזכיר לך פעם בחודש על מה שפתוח.</p>
          <p className="mt-1 text-[11px] font-semibold text-slate-500">עדכון אחרון: {fmt(data.lastUpdated)}</p>
        </div>
      </div>
      {error ? <p role="alert" className="rounded-2xl border border-rose-300/50 bg-rose-500/10 px-3 py-2 text-sm font-semibold text-rose-800">{error}</p> : null}

      <Group title="המשימות שלך" sub="מה שרק בעל המאגר יכול לעשות">
        {owner.map((it, i) => <ItemCard key={it.key} n={i + 1} item={it} data={data} rows={rows} busy={busy} set={set} />)}
      </Group>
      <Group title="דרישות לרמת האבטחה הגבוהה" sub="לא חובה ברמה הנוכחית. מומלץ לקראת ההשקה או כשמספר המשתמשים יגדל">
        {high.map((it, i) => <ItemCard key={it.key} n={owner.length + i + 1} item={it} data={data} rows={rows} busy={busy} set={set} />)}
      </Group>

      <Group title="המסמכים" sub="נפתחים רק לך, אחרי בדיקת הרשאה בשרת. מסמך 06 חסוי">
        <div className={cn(opsGlassCardClass, 'divide-y divide-gc/40 p-0 sm:p-0')}>
          {COMPLIANCE_DOCS.map((d) => (
            <div key={d.slug} className="flex flex-wrap items-center gap-2 px-4 py-3 sm:px-5">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-emerald-500/10 text-emerald-700">{d.sensitive ? <Lock size={16} /> : <FileText size={16} />}</span>
              <span className="min-w-0 flex-1 text-sm font-bold text-slate-900"><span className="text-slate-400" dir="ltr">{d.slug.slice(0, 2)}</span> · {d.title}</span>
              {(['pdf', 'docx'] as const).map((ext) => have.has(`${d.slug}.${ext}`) ? (
                <a key={ext} href={`/api/v1/admin/privacy-compliance/docs/${d.slug}.${ext}`} target="_blank" rel="noopener noreferrer" className={opsGlassBtnClass}><Download size={13} />{ext === 'pdf' ? 'PDF' : 'Word'}</a>
              ) : null)}
            </div>
          ))}
        </div>
      </Group>
    </div>
  );
}

function Group({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-gradient-to-l from-amber-400/60 to-transparent" />
        <div className="text-center"><p className="font-display text-sm font-black text-slate-900">{title}</p><p className="text-[11px] text-slate-500">{sub}</p></div>
        <span className="h-px flex-1 bg-gradient-to-r from-amber-400/60 to-transparent" />
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}
