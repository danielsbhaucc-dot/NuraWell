'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bot, CalendarClock, CheckCircle2, ChevronLeft, Loader2, RotateCw, UserRound } from 'lucide-react';
import { opsGlassCardClass } from '@/components/admin/OpsPanel';
import { cn } from '@/lib/cn';
import { Divider } from './Divider';
import {
  OWNER_HE, RECURRENCE_HE, STATUSES, STATUS_HE, daysBetween, dueState,
  type ComplianceTask, type DueState, type TaskStatus,
} from '@/lib/legal/compliance-tasks';

type Data = { today: string; tasks: ComplianceTask[] };

const STATE_CHIP: Record<DueState, { label: string; cls: string }> = {
  overdue: { label: 'באיחור', cls: 'border-rose-300/60 bg-rose-500/10 text-rose-800' },
  due_soon: { label: 'בקרוב', cls: 'border-amber-300/70 bg-amber-500/15 text-amber-800' },
  scheduled: { label: 'מתוכנן', cls: 'border-teal-300/60 bg-teal-500/10 text-teal-800' },
  done: { label: 'בוצע', cls: 'border-emerald-300/60 bg-emerald-500/10 text-emerald-800' },
  not_relevant: { label: 'לא רלוונטי', cls: 'border-slate-300/60 bg-slate-500/10 text-slate-600' },
};
const RANK: Record<DueState, number> = { overdue: 0, due_soon: 1, scheduled: 2, done: 3, not_relevant: 4 };

const fmt = (d: string | null) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' }) : '—');

/** רשימת משימות משפטיות ועמידה בחוק — אוטונומית, עם מועדים חוזרים. */
export function ComplianceTasks() {
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const load = useCallback(() => {
    fetch('/api/v1/ops/legal/compliance-tasks', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: Data) => { setData(d); setErr(false); })
      .catch(() => setErr(true));
  }, []);
  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => {
    if (!data) return [];
    return data.tasks
      .map((t) => ({ t, s: dueState(t, data.today) }))
      .sort((a, b) => RANK[a.s] - RANK[b.s] || (a.t.next_due ?? '9').localeCompare(b.t.next_due ?? '9') || a.t.sort_order - b.t.sort_order);
  }, [data]);
  const counts = useMemo(() => ({
    overdue: rows.filter((r) => r.s === 'overdue').length,
    soon: rows.filter((r) => r.s === 'due_soon').length,
    auto: rows.filter((r) => r.t.owner === 'automatic').length,
  }), [rows]);

  const replace = (task: ComplianceTask) => setData((d) => (d ? { ...d, tasks: d.tasks.map((x) => (x.id === task.id ? task : x)) } : d));

  if (err && !data) return (
    <div role="alert" className="flex items-center justify-between gap-3 rounded-2xl border border-rose-300/60 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-800">
      לא הצלחנו לטעון את רשימת המשימות.
      <button type="button" onClick={load} className="inline-flex items-center gap-1 rounded-xl border border-rose-400/40 px-3 py-1.5 text-[13px]"><RotateCw size={14} />לנסות שוב</button>
    </div>
  );
  if (!data) return <div className={cn(opsGlassCardClass, 'grid place-items-center p-10')} data-testid="compliance-loading"><Loader2 className="animate-spin text-slate-400" /></div>;

  return (
    <section dir="rtl" className={cn(opsGlassCardClass, 'p-4 sm:p-5')} aria-label="משימות משפטיות" data-testid="compliance-tasks">
      <p className="text-[12px] font-bold tracking-wide text-amber-700">משימות משפטיות ועמידה בחוק</p>
      <h2 className="mt-0.5 font-[Rubik] text-xl font-bold text-slate-900 sm:text-2xl">
        {counts.overdue ? `${counts.overdue} באיחור` : counts.soon ? `${counts.soon} מגיעות בשבועיים הקרובים` : 'הכול מתוזמן'}
      </h2>
      <p className="mt-1 text-[13px] leading-relaxed text-slate-600">
        {counts.auto} מהמשימות מתבצעות אוטומטית. כשמשימה חוזרת מגיעה למועד, היא עולה כאן ותקבל עדכון. המחירים הם הערכות שוק, לא הצעות מחיר.
      </p>
      <Divider tone="gold" className="my-3.5" />
      <ul className="space-y-2">
        {rows.map(({ t, s }) => (
          <TaskRow key={t.id} t={t} s={s} today={data.today} open={open === t.id} onToggle={() => setOpen(open === t.id ? null : t.id)} onSaved={replace} />
        ))}
      </ul>
    </section>
  );
}

function TaskRow({ t, s, today, open, onToggle, onSaved }: { t: ComplianceTask; s: DueState; today: string; open: boolean; onToggle: () => void; onSaved: (t: ComplianceTask) => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [evidence, setEvidence] = useState(t.evidence ?? '');
  useEffect(() => setEvidence(t.evidence ?? ''), [t.evidence]);
  const chip = STATE_CHIP[s];
  const days = t.next_due ? daysBetween(today, t.next_due) : null;

  const save = async (body: Record<string, unknown>, okText: string) => {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch(`/api/v1/ops/legal/compliance-tasks/${t.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error();
      const { task } = (await r.json()) as { task: ComplianceTask };
      onSaved(task); setMsg({ ok: true, text: okText });
    } catch { setMsg({ ok: false, text: 'השמירה נכשלה. נסו שוב.' }); }
    finally { setBusy(false); }
  };

  return (
    <li className="overflow-hidden rounded-[20px] border border-gc/40 bg-glass/25 backdrop-blur-md" data-testid="compliance-task">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-start gap-3 p-3.5 text-right">
        <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-xl', t.owner === 'automatic' ? 'bg-teal-500/15 text-teal-700' : 'bg-amber-500/15 text-amber-700')} title={OWNER_HE[t.owner]}>
          {t.owner === 'automatic' ? <Bot size={17} /> : <UserRound size={17} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-[Rubik] text-[14.5px] font-bold leading-snug text-slate-900">{t.title}</span>
          <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px] text-slate-600">
            <span className={cn('rounded-full border px-2 py-0.5 font-bold', chip.cls)}>{chip.label}</span>
            <span className={cn('rounded-full border px-2 py-0.5', t.requirement === 'required' ? 'border-rose-300/50 text-rose-800' : 'border-slate-300/60 text-slate-600')}>{t.requirement === 'required' ? 'חובה' : 'מומלץ'}</span>
            <span className="inline-flex items-center gap-1"><CalendarClock size={13} />{t.next_due ? `${fmt(t.next_due)}${days !== null && days < 0 ? ` (לפני ${-days} ימים)` : days !== null && days <= 30 ? ` (בעוד ${days} ימים)` : ''}` : 'ללא מועד'}</span>
            <span>· {RECURRENCE_HE[t.recurrence]}</span>
          </span>
        </span>
        <ChevronLeft size={16} className={cn('mt-2 shrink-0 text-slate-500 transition', open && '-rotate-90')} />
      </button>
      {open ? (
        <div className="space-y-3 px-3.5 pb-4 text-[13.5px] leading-relaxed text-slate-700">
          <Divider tone="teal" />
          <p>{t.explanation}</p>
          <p><b className="text-slate-900">למה זה חשוב משפטית: </b>{t.legal_why}</p>
          {t.cost_estimate ? <p className="rounded-xl border border-amber-300/50 bg-amber-500/10 px-3 py-2 text-amber-900"><b>עלות משוערת (הערכה בלבד): </b>{t.cost_estimate}</p> : null}
          <dl className="grid grid-cols-2 gap-2 text-[12.5px] sm:grid-cols-4">
            <div><dt className="text-slate-500">אחריות</dt><dd className="font-bold">{OWNER_HE[t.owner]}</dd></div>
            <div><dt className="text-slate-500">סטטוס</dt><dd className="font-bold">{STATUS_HE[t.status]}</dd></div>
            <div><dt className="text-slate-500">בוצע לאחרונה</dt><dd className="font-bold">{fmt(t.last_done)}</dd></div>
            <div><dt className="text-slate-500">מועד הבא</dt><dd className="font-bold">{fmt(t.next_due)}</dd></div>
          </dl>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="שינוי סטטוס">
            {STATUSES.filter((x) => x !== 'done').map((x: TaskStatus) => (
              <button key={x} type="button" disabled={busy || t.status === x} onClick={() => void save({ status: x }, 'הסטטוס עודכן.')}
                className={cn('min-h-9 rounded-xl border px-3 text-[12.5px] font-bold transition disabled:opacity-60', t.status === x ? 'border-teal-700/40 bg-teal-600/15 text-teal-900' : 'border-slate-300/60 text-slate-700 hover:bg-glass/50')}>
                {STATUS_HE[x]}
              </button>
            ))}
            <button type="button" disabled={busy} onClick={() => void save({ complete: true }, t.recurrence === 'one_time' ? 'סומן כבוצע.' : 'סומן כבוצע. המועד הבא נקבע לבד.')} data-testid="compliance-complete"
              className="inline-flex min-h-9 items-center gap-1 rounded-xl bg-linear-to-br from-teal-700 to-emerald-700 px-3.5 text-[12.5px] font-bold text-amber-50 shadow-[0_6px_16px_rgba(4,120,87,0.28)] disabled:opacity-60">
              {busy ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}סימון כבוצע
            </button>
          </div>
          <label className="block">
            <span className="text-[12.5px] font-bold text-slate-800">ראיה: קישור או הערה</span>
            <textarea value={evidence} onChange={(e) => setEvidence(e.target.value)} maxLength={2000} rows={2}
              className="mt-1 w-full rounded-xl border border-gc/50 bg-glass/40 px-3 py-2 text-[13px] text-slate-800 outline-none focus:border-teal-600/60" />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={busy || evidence === (t.evidence ?? '')} onClick={() => void save({ evidence }, 'הראיה נשמרה.')}
              className="min-h-9 rounded-xl border border-teal-700/25 bg-teal-600/10 px-3.5 text-[12.5px] font-bold text-teal-800 disabled:opacity-50">שמירת ראיה</button>
            {msg ? <span role="status" className={cn('text-[12.5px] font-semibold', msg.ok ? 'text-emerald-700' : 'text-rose-700')}>{msg.text}</span> : null}
          </div>
        </div>
      ) : null}
    </li>
  );
}
