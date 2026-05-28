'use client';

import Link from 'next/link';
import { useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Clock,
  Flame,
  History,
  Loader2,
  MapPin,
  XCircle,
} from 'lucide-react';
import { slotLabel } from '../../lib/journey/task-schedule';
import type {
  TaskHistoryDay,
  TaskHistoryEntry,
  TaskHistoryRange,
  TaskHistoryReport,
} from '../../lib/journey/build-task-history';
import type { JourneyTaskSlot } from '../../lib/types/journey';

const glassCard =
  'rounded-[22px] border border-white/50 shadow-[0_12px_40px_rgba(6,78,59,0.08)] backdrop-blur-xl bg-white/55';

const PERIOD_TABS: { id: TaskHistoryRange; label: string }[] = [
  { id: 'day', label: 'היום' },
  { id: 'week', label: 'שבוע' },
  { id: 'month', label: 'חודש' },
  { id: 'year', label: 'שנה' },
  { id: 'all', label: 'הכל' },
];

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('he-IL', {
    timeZone: 'Asia/Jerusalem',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDateKey(key: string): string {
  const d = new Date(`${key}T12:00:00`);
  if (Number.isNaN(d.getTime())) return key;
  const today = new Date();
  const todayKey = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(today);
  const yesterday = new Date(today.getTime() - 86400000);
  const yesterdayKey = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(yesterday);
  if (key === todayKey) return 'היום';
  if (key === yesterdayKey) return 'אתמול';
  return d.toLocaleDateString('he-IL', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

function formatTimeOnly(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('he-IL', {
    timeZone: 'Asia/Jerusalem',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const DAY_STATUS: Record<
  TaskHistoryDay['status'],
  { label: string; dot: string; bg: string; text: string }
> = {
  done: {
    label: 'הושלם',
    dot: 'bg-emerald-500',
    bg: 'bg-emerald-50/90 border-emerald-200/60',
    text: 'text-emerald-900',
  },
  partial: {
    label: 'חלקי',
    dot: 'bg-amber-500',
    bg: 'bg-amber-50/90 border-amber-200/60',
    text: 'text-amber-900',
  },
  missed: {
    label: 'פספוס',
    dot: 'bg-rose-500',
    bg: 'bg-rose-50/90 border-rose-200/60',
    text: 'text-rose-900',
  },
  off: {
    label: 'לא פעיל',
    dot: 'bg-slate-200',
    bg: 'bg-slate-50/80 border-slate-200/50',
    text: 'text-slate-500',
  },
  before_accept: {
    label: 'לפני קבלה',
    dot: 'bg-slate-100',
    bg: 'bg-slate-50/50 border-slate-100',
    text: 'text-slate-400',
  },
};

function DayRow({ day }: { day: TaskHistoryDay }) {
  const [open, setOpen] = useState(false);
  const st = DAY_STATUS[day.status];
  const hasExec = day.executions.length > 0;

  if (day.status === 'off' || day.status === 'before_accept') return null;

  return (
    <div className={`rounded-2xl border px-3 py-2.5 ${st.bg}`}>
      <button
        type="button"
        onClick={() => hasExec && setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 text-right"
        disabled={!hasExec}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${st.dot}`} />
          <span className={`text-xs font-bold ${st.text}`}>{formatDateKey(day.date_key)}</span>
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${st.bg} ${st.text}`}>
            {st.label}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {day.was_due && day.expected_slots > 1 ? (
            <span className="text-[10px] font-bold text-gray-600">
              {day.done_slots}/{day.expected_slots}
            </span>
          ) : null}
          {hasExec ? (
            <ChevronDown
              className={`w-3.5 h-3.5 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`}
            />
          ) : null}
        </div>
      </button>

      <AnimatePresence initial={false}>
        {open && hasExec ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <ul className="mt-2 space-y-1.5 border-t border-white/60 pt-2">
              {day.executions.map((ex, i) => (
                <li
                  key={`${ex.slot}-${ex.completed_at}-${i}`}
                  className="flex items-center justify-between gap-2 text-[11px]"
                >
                  <span className="font-bold text-emerald-800 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 shrink-0" />
                    {slotLabel(ex.slot as JourneyTaskSlot)}
                  </span>
                  <span className="text-gray-600 font-medium tabular-nums">
                    {formatTimeOnly(ex.completed_at)}
                    {ex.source !== 'manual' ? (
                      <span className="text-[9px] text-violet-700 mr-1">· {ex.source}</span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function TaskCard({ task }: { task: TaskHistoryEntry }) {
  const [expanded, setExpanded] = useState(false);
  const visibleDays = task.days.filter(
    (d) => d.status !== 'off' && d.status !== 'before_accept'
  );

  return (
    <article className={`${glassCard} overflow-hidden`}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full p-4 text-right"
      >
        <div className="flex items-start gap-3 flex-row-reverse">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-2xl"
            style={{
              background: 'linear-gradient(145deg, rgba(255,255,255,0.92), rgba(236,253,245,0.5))',
              border: '1px solid rgba(255,255,255,0.85)',
              boxShadow: '0 6px 20px rgba(6,78,59,0.08)',
            }}
          >
            {task.task_emoji}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-black text-[#1A1730] leading-snug line-clamp-2">
                  {task.task_title}
                </p>
                <p className="text-[10px] font-semibold text-gray-500 mt-0.5 flex items-center gap-1 flex-wrap justify-end">
                  <MapPin className="w-3 h-3 shrink-0" />
                  צעד {task.step_number}: {task.step_title}
                </p>
              </div>
              <ChevronDown
                className={`w-4 h-4 text-gray-500 shrink-0 mt-1 transition-transform ${expanded ? 'rotate-180' : ''}`}
              />
            </div>

            <div className="flex flex-wrap gap-1.5 mt-2 justify-end">
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100/90 text-emerald-900 border border-emerald-200/50">
                {task.schedule_label}
              </span>
              {task.schedule === 'one_time' && task.execution_done ? (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-100 text-teal-900 border border-teal-200/50">
                  בוצע ✓
                </span>
              ) : null}
              {task.current_streak > 0 ? (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-900 border border-orange-200/50 inline-flex items-center gap-0.5">
                  <Flame className="w-3 h-3" />
                  רצף {task.current_streak}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 mt-3">
          <div className="rounded-xl bg-white/70 border border-emerald-200/40 px-2 py-2 text-center">
            <p className="text-[9px] font-bold text-gray-500">ביצועים</p>
            <p className="text-base font-black text-emerald-900">{task.total_executions_in_range}</p>
          </div>
          <div className="rounded-xl bg-white/70 border border-emerald-200/40 px-2 py-2 text-center">
            <p className="text-[9px] font-bold text-gray-500">הצלחה</p>
            <p className="text-base font-black text-emerald-900">{task.success_rate_pct}%</p>
          </div>
          <div className="rounded-xl bg-white/70 border border-rose-200/40 px-2 py-2 text-center">
            <p className="text-[9px] font-bold text-gray-500">פספוסים</p>
            <p className="text-base font-black text-rose-800">{task.missed_days_in_range}</p>
          </div>
        </div>
      </button>

      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-3 border-t border-emerald-900/[0.06] pt-3">
              <div className="space-y-2">
                <MetaRow
                  icon={<CalendarDays className="w-3.5 h-3.5" />}
                  label="קיבלתי על עצמי"
                  value={formatDateTime(task.accepted_at)}
                  accent="text-emerald-800"
                />
                <MetaRow
                  icon={<Clock className="w-3.5 h-3.5" />}
                  label="ביצוע ראשון"
                  value={formatDateTime(task.first_execution_at)}
                  accent="text-teal-800"
                />
                <MetaRow
                  icon={<History className="w-3.5 h-3.5" />}
                  label="ביצוע אחרון"
                  value={formatDateTime(task.last_execution_at)}
                  accent="text-violet-800"
                />
                {task.best_streak > 0 ? (
                  <MetaRow
                    icon={<Flame className="w-3.5 h-3.5" />}
                    label="שיא רצף"
                    value={`${task.best_streak} ימים`}
                    accent="text-orange-800"
                  />
                ) : null}
              </div>

              {task.task_description ? (
                <p className="text-xs text-gray-600 leading-relaxed bg-white/50 rounded-xl px-3 py-2 border border-white/60">
                  {task.task_description}
                </p>
              ) : null}

              {visibleDays.length > 0 ? (
                <div>
                  <p className="text-[10px] font-bold text-gray-500 mb-2">יומן לפי יום</p>
                  <div className="space-y-2 max-h-[min(50vh,360px)] overflow-y-auto pr-0.5">
                    {visibleDays.map((day) => (
                      <DayRow key={day.date_key} day={day} />
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-gray-500 text-center py-3 bg-slate-50/80 rounded-xl">
                  אין ביצועים מתועדים בתקופה זו
                </p>
              )}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </article>
  );
}

function MetaRow({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs bg-white/55 rounded-xl px-3 py-2 border border-white/70">
      <span className={`font-bold tabular-nums ${accent}`}>{value}</span>
      <span className="flex items-center gap-1.5 text-gray-600 font-semibold">
        {label}
        <span className={accent}>{icon}</span>
      </span>
    </div>
  );
}

export function TaskHistoryClient({ initialReport }: { initialReport: TaskHistoryReport }) {
  const [report, setReport] = useState<TaskHistoryReport>(initialReport);
  const [range, setRange] = useState<TaskHistoryRange>(initialReport.meta.range);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadRange = useCallback(async (next: TaskHistoryRange) => {
    setRange(next);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/task-history?range=${next}`, { credentials: 'include' });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `שגיאה ${res.status}`);
      }
      const data = (await res.json()) as TaskHistoryReport;
      setReport(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'טעינה נכשלה');
    } finally {
      setLoading(false);
    }
  }, []);

  const { meta, tasks, rejected_tasks: rejected } = report;

  return (
    <div className="min-h-screen pb-6" style={{ background: '#EDF5F0' }}>
      <div
        className="-mt-16 pt-16 pb-5 px-4"
        style={{ background: 'linear-gradient(160deg, #064e3b 0%, #047857 50%, #10b981 100%)' }}
      >
        <div className="flex items-center gap-3 mb-3">
          <Link
            href="/progress"
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15 border border-white/25 text-white"
            aria-label="חזרה להתקדמות"
          >
            <ArrowRight className="w-5 h-5" />
          </Link>
          <div className="min-w-0 flex-1 text-right">
            <p className="text-white/75 text-xs font-semibold">מעקב מפורט</p>
            <h1
              className="text-xl font-black text-white leading-tight"
              style={{ fontFamily: "'Rubik','Heebo',sans-serif" }}
            >
              היסטוריית משימות
            </h1>
          </div>
        </div>
        <p className="text-white/85 text-sm leading-relaxed pr-12">
          מתי קיבלת · מתי התחלת · הצלחות ופספוסים — לפי תאריך ושעה
        </p>
      </div>

      <div className="container-mobile -mt-3 space-y-4 relative z-[1]">
        <div className={`${glassCard} p-2`}>
          <div className="flex gap-1 overflow-x-auto pb-0.5 scrollbar-hide">
            {PERIOD_TABS.map((tab) => {
              const active = range === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  disabled={loading}
                  onClick={() => void loadRange(tab.id)}
                  className={`shrink-0 min-w-[52px] px-3 py-2 rounded-xl text-xs font-black transition ${
                    active
                      ? 'bg-emerald-600 text-white shadow-md shadow-emerald-900/20'
                      : 'bg-white/60 text-gray-700 border border-emerald-200/40'
                  } disabled:opacity-60`}
                >
                  {tab.label}
                </button>
              );
            })}
            {loading ? (
              <span className="flex items-center px-2 text-emerald-700">
                <Loader2 className="w-4 h-4 animate-spin" />
              </span>
            ) : null}
          </div>
          <p className="text-[10px] font-semibold text-gray-600 text-center mt-2 px-1">
            {meta.label}
            {meta.range !== 'day' ? ` · ${meta.from} — ${meta.to}` : ''}
          </p>
        </div>

        {error ? (
          <div className="rounded-2xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-900 font-medium text-center">
            {error}
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-2.5">
          <StatMini label="משימות פעילות" value={String(report.total_accepted_lifetime)} />
          <StatMini label="ביצועים בתקופה" value={String(report.total_executions_in_range)} />
          <StatMini label="ימים פעילים" value={String(report.active_days_in_range)} />
          <StatMini
            label="אחוז הצלחה"
            value={`${report.overall_success_rate_pct}%`}
            highlight
          />
        </div>

        {tasks.length === 0 ? (
          <div className={`${glassCard} text-center py-14 px-4`}>
            <div className="text-5xl mb-3">📋</div>
            <h3 className="text-lg font-black text-[#1A1730] mb-2">עדיין אין משימות מקובלות</h3>
            <p className="text-gray-600 text-sm mb-6 leading-relaxed">
              במסע, לחץ &quot;מקובל עליי&quot; על משימה — וההיסטוריה תופיע כאן אוטומטית
            </p>
            <Link
              href="/journey"
              className="inline-flex items-center justify-center px-6 py-3 rounded-2xl font-bold text-white"
              style={{
                background: 'linear-gradient(135deg, #047857, #10b981)',
                boxShadow: '0 8px 24px rgba(16,185,129,0.3)',
              }}
            >
              למסע שלי
            </Link>
          </div>
        ) : (
          <section className="space-y-3">
            <div className="flex items-center gap-2 px-0.5">
              <div className="w-1.5 h-6 rounded-full bg-gradient-to-b from-amber-400 to-emerald-700" />
              <h2 className="text-base font-black text-[#1A1730]">
                {tasks.length} משימות · {meta.label}
              </h2>
            </div>
            {tasks.map((task) => (
              <TaskCard key={task.task_id} task={task} />
            ))}
          </section>
        )}

        {rejected.length > 0 ? (
          <section className={`${glassCard} p-4`}>
            <div className="flex items-center gap-2 mb-3">
              <XCircle className="w-4 h-4 text-rose-600" />
              <h3 className="text-sm font-black text-[#1A1730]">לא מקובל ({rejected.length})</h3>
            </div>
            <ul className="space-y-2">
              {rejected.map((r) => (
                <li
                  key={r.task_id}
                  className="flex items-center justify-between gap-2 text-xs border-b border-slate-100 pb-2 last:border-0"
                >
                  <span className="text-gray-500 shrink-0 tabular-nums">
                    {r.rejected_at ? formatDateTime(r.rejected_at) : '—'}
                  </span>
                  <span className="font-medium text-slate-800 text-right min-w-0 line-clamp-1">
                    {r.task_title}
                    <span className="text-gray-500 font-normal"> · צעד {r.step_number}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </div>
  );
}

function StatMini({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`${glassCard} p-3 text-center ${highlight ? 'ring-2 ring-emerald-400/40' : ''}`}
    >
      <p className="text-[10px] font-bold text-gray-500 mb-0.5">{label}</p>
      <p className={`text-lg font-black ${highlight ? 'text-emerald-800' : 'text-[#1A1730]'}`}>
        {value}
      </p>
    </div>
  );
}
