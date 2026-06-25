'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useProgressLiveRefresh } from '../../lib/journey/use-progress-live-refresh';
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
  TaskHistoryDayStatus,
  TaskHistoryEntry,
  TaskHistoryRange,
  TaskHistoryReport,
} from '../../lib/journey/build-task-history';
import type { JourneyTaskSlot } from '../../lib/types/journey';
import { AlmogScreenCoach } from '../ai/AlmogScreenCoach';
import { DayDetailPopup, type DayExecRow } from '../tasks/DayDetailPopup';
import { formatHebrewRelativeFromDateKey } from '../../lib/time/hebrew-relative';

/* ── Design tokens — no #FFF anywhere ───────────────────────────── */
const glassCard = {
  background:
    'linear-gradient(170deg, rgba(236,253,245,0.82) 0%, rgba(220,252,231,0.72) 55%, rgba(254,252,232,0.68) 100%)',
  border: '1px solid rgba(167,243,208,0.55)',
  boxShadow:
    '0 12px 40px rgba(6,78,59,0.08), inset 0 1px 0 rgba(236,253,245,0.9)',
  backdropFilter: 'blur(20px) saturate(1.2)',
  WebkitBackdropFilter: 'blur(20px) saturate(1.2)',
} as const;

const glassTaskCard = {
  background:
    'linear-gradient(165deg, rgba(236,253,245,0.88) 0%, rgba(209,250,229,0.65) 45%, rgba(254,252,232,0.55) 100%)',
  border: '1px solid rgba(110,231,183,0.45)',
  boxShadow:
    '0 18px 48px rgba(6,78,59,0.1), 0 0 0 1px rgba(167,243,208,0.35) inset, inset 0 1px 1px rgba(236,253,245,0.95)',
  backdropFilter: 'blur(24px) saturate(1.35)',
  WebkitBackdropFilter: 'blur(24px) saturate(1.35)',
} as const;

const PERIOD_TABS: { id: TaskHistoryRange; label: string }[] = [
  { id: 'day', label: 'היום' },
  { id: 'week', label: 'שבוע' },
  { id: 'month', label: 'חודש' },
  { id: 'year', label: 'שנה' },
  { id: 'all', label: 'הכל' },
];

/* ── Status config ──────────────────────────────────────────────── */
const DAY_STATUS: Record<
  TaskHistoryDayStatus,
  { label: string; dot: string; bg: string; text: string; border: string }
> = {
  done: {
    label: 'הושלם',
    dot: 'bg-emerald-500',
    bg: 'rgba(209,250,229,0.75)',
    text: 'text-emerald-900',
    border: 'border-emerald-300/60',
  },
  in_progress: {
    label: 'בתהליך',
    dot: 'bg-sky-400',
    bg: 'rgba(224,242,254,0.8)',
    text: 'text-sky-900',
    border: 'border-sky-300/60',
  },
  partial: {
    label: 'חלקי',
    dot: 'bg-amber-500',
    bg: 'rgba(254,243,199,0.8)',
    text: 'text-amber-900',
    border: 'border-amber-300/60',
  },
  pending: {
    label: 'פתוח',
    dot: 'bg-sky-300',
    bg: 'rgba(224,242,254,0.55)',
    text: 'text-sky-800',
    border: 'border-sky-200/50',
  },
  missed: {
    label: 'פספוס',
    dot: 'bg-rose-300/90',
    bg: 'rgba(255,228,230,0.55)',
    text: 'text-rose-800/90',
    border: 'border-rose-200/50',
  },
  off: {
    label: 'לא פעיל',
    dot: 'bg-slate-200/80',
    bg: 'rgba(241,245,249,0.5)',
    text: 'text-slate-400',
    border: 'border-slate-200/40',
  },
  before_accept: {
    label: 'לפני קבלה',
    dot: 'bg-slate-100',
    bg: 'rgba(248,250,252,0.4)',
    text: 'text-slate-300',
    border: 'border-slate-100/40',
  },
};

/* ── Formatters ─────────────────────────────────────────────────── */
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

function formatTimeOnly(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('he-IL', {
    timeZone: 'Asia/Jerusalem',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function jerusalemTodayKey(): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/* ── Aggregate day status across all tasks ──────────────────────── */
type AggStatus = 'done' | 'partial' | 'in_progress' | 'pending' | 'missed' | 'off';

function aggregateDayStatus(days: TaskHistoryDay[]): AggStatus {
  const visible = days.filter((d) => d.status !== 'off' && d.status !== 'before_accept');
  if (visible.length === 0) return 'off';
  const hasDone = visible.some((d) => d.status === 'done');
  const hasPartial = visible.some((d) => d.status === 'partial');
  const hasInProgress = visible.some((d) => d.status === 'in_progress');
  const hasPending = visible.some((d) => d.status === 'pending');
  const hasMissed = visible.some((d) => d.status === 'missed');
  if (visible.every((d) => d.status === 'done')) return 'done';
  if (hasInProgress || (hasDone && (hasPartial || hasPending))) return 'in_progress';
  if (hasPartial || hasDone) return 'partial';
  if (hasPending) return 'pending';
  if (hasMissed) return 'missed';
  return 'off';
}

const AGG_DOT: Record<AggStatus, string> = {
  done: 'bg-emerald-500',
  partial: 'bg-amber-500',
  in_progress: 'bg-sky-400',
  pending: 'bg-sky-300',
  missed: 'bg-rose-300/85',
  off: 'bg-slate-200/70',
};

/* ── Period timeline strip (week/month/year) ────────────────────── */
function PeriodTimeline({
  tasks,
  todayKey,
  onSelectDay,
  activeKey,
}: {
  tasks: TaskHistoryEntry[];
  todayKey: string;
  onSelectDay: (dateKey: string) => void;
  activeKey: string | null;
}) {
  const dateKeys = useMemo(() => {
    const set = new Set<string>();
    for (const task of tasks) {
      for (const day of task.days) {
        if (day.status !== 'off' && day.status !== 'before_accept') {
          set.add(day.date_key);
        }
      }
    }
    return [...set].sort((a, b) => b.localeCompare(a));
  }, [tasks]);

  if (dateKeys.length === 0) return null;

  return (
    <div
      className="rounded-2xl p-3"
      style={{
        background: 'rgba(220,252,231,0.45)',
        border: '1px solid rgba(167,243,208,0.45)',
      }}
    >
      <p className="text-[10px] font-bold text-emerald-900/75 mb-2 text-right">
        ציר זמן · {dateKeys.length} ימים
      </p>
      <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide">
        {dateKeys.map((dateKey) => {
          const dayRows = tasks.flatMap((t) => t.days.filter((d) => d.date_key === dateKey));
          const agg = aggregateDayStatus(dayRows);
          const isToday = dateKey === todayKey;
          const isActive = activeKey === dateKey;
          const totalExec = dayRows.reduce((s, d) => s + d.done_slots, 0);
          return (
            <button
              key={dateKey}
              type="button"
              onClick={() => onSelectDay(dateKey)}
              className={`flex min-w-[38px] flex-col items-center gap-0.5 px-1 py-1.5 rounded-xl transition active:scale-95 no-tap-highlight touch-manipulation shrink-0 ${
                isActive ? 'bg-emerald-100/90 ring-1 ring-emerald-400/60' : 'hover:bg-emerald-50/70'
              }`}
            >
              <span
                className={`h-3 w-3 rounded-full ${AGG_DOT[agg]} ${
                  isToday ? 'ring-2 ring-sky-300/70' : ''
                }`}
              />
              <span className="text-[9px] font-bold text-emerald-900/80">{dateKey.slice(8)}</span>
              {totalExec > 0 ? (
                <span className="text-[8px] font-black text-emerald-800">{totalExec}</span>
              ) : null}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-2 justify-end mt-2 text-[9px] font-semibold text-emerald-900/70">
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          הושלם
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-amber-500" />
          חלקי
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-sky-400" />
          בתהליך
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-sky-300" />
          פתוח
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-rose-300/85" />
          פספוס
        </span>
      </div>
    </div>
  );
}

/* ── Day row inside expanded task card ─────────────────────────── */
function DayRow({ day, todayKey }: { day: TaskHistoryDay; todayKey: string }) {
  const [open, setOpen] = useState(false);
  const st = DAY_STATUS[day.status];
  const hasExec = day.executions.length > 0;

  if (day.status === 'off' || day.status === 'before_accept') return null;

  return (
    <div
      className={`rounded-2xl px-3 py-2.5 border ${st.border}`}
      style={{ background: st.bg }}
    >
      <button
        type="button"
        onClick={() => hasExec && setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 text-right"
        disabled={!hasExec}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${st.dot}`} />
          <span className={`text-xs font-bold ${st.text}`}>
            {formatHebrewRelativeFromDateKey(day.date_key, todayKey)}
          </span>
          <span
            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${st.text}`}
            style={{ background: 'rgba(167,243,208,0.35)', border: '1px solid rgba(110,231,183,0.35)' }}
          >
            {st.label}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {day.was_due && day.expected_slots > 1 ? (
            <span className="text-[10px] font-bold text-emerald-900/75">
              {day.done_slots}/{day.expected_slots}
            </span>
          ) : null}
          {hasExec ? (
            <ChevronDown
              className={`w-3.5 h-3.5 text-emerald-800/60 transition-transform ${open ? 'rotate-180' : ''}`}
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
            <ul
              className="mt-2 space-y-1.5 pt-2"
              style={{ borderTop: '1px solid rgba(167,243,208,0.4)' }}
            >
              {day.executions.map((ex, i) => (
                <li
                  key={`${ex.slot}-${ex.completed_at}-${i}`}
                  className="flex items-center justify-between gap-2 text-[11px]"
                >
                  <span className="font-bold text-emerald-800 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 shrink-0" />
                    {slotLabel(ex.slot as JourneyTaskSlot)}
                  </span>
                  <span className="text-emerald-900/70 font-medium tabular-nums">
                    {formatTimeOnly(ex.completed_at)}
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

/* ── Task card — glass, expandable ──────────────────────────────── */
function TaskCard({ task, todayKey }: { task: TaskHistoryEntry; todayKey: string }) {
  const [expanded, setExpanded] = useState(false);
  const visibleDays = task.days.filter(
    (d) => d.status !== 'off' && d.status !== 'before_accept'
  );

  const encouragement =
    task.missed_days_in_range === 0 && task.active_days_in_range > 0
      ? 'יום מצוין — הכל מתועד 🌿'
      : task.partial_days_in_range > 0
        ? `${task.partial_days_in_range} ימים חלקיים — כל צעד נחשב`
        : task.pending_days_in_range > 0
          ? 'היום עוד פתוח — אפשר להשלים'
          : null;

  return (
    <article className="rounded-[24px] overflow-hidden" style={glassTaskCard}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full p-4 text-right"
      >
        <div className="flex items-start gap-3 flex-row-reverse">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-2xl"
            style={{
              background:
                'linear-gradient(145deg, rgba(220,252,231,0.9), rgba(254,252,232,0.65))',
              border: '1px solid rgba(167,243,208,0.6)',
              boxShadow: '0 6px 20px rgba(6,78,59,0.08)',
            }}
          >
            {task.task_emoji}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-black text-emerald-950 leading-snug line-clamp-2">
                  {task.task_title}
                </p>
                <p className="text-[10px] font-semibold text-emerald-900/65 mt-0.5 flex items-center gap-1 flex-wrap justify-end">
                  <MapPin className="w-3 h-3 shrink-0" />
                  צעד {task.step_number}: {task.step_title}
                </p>
              </div>
              <ChevronDown
                className={`w-4 h-4 text-emerald-800/60 shrink-0 mt-1 transition-transform ${expanded ? 'rotate-180' : ''}`}
              />
            </div>

            <div className="flex flex-wrap gap-1.5 mt-2 justify-end">
              <span
                className="text-[10px] font-bold px-2 py-0.5 rounded-full text-emerald-900"
                style={{
                  background: 'rgba(167,243,208,0.55)',
                  border: '1px solid rgba(110,231,183,0.4)',
                }}
              >
                {task.schedule_label}
              </span>
              {task.schedule === 'one_time' && task.execution_done ? (
                <span
                  className="text-[10px] font-bold px-2 py-0.5 rounded-full text-teal-900"
                  style={{
                    background: 'rgba(153,246,228,0.55)',
                    border: '1px solid rgba(94,234,212,0.45)',
                  }}
                >
                  בוצע ✓
                </span>
              ) : null}
              {task.current_streak > 0 ? (
                <span
                  className="text-[10px] font-bold px-2 py-0.5 rounded-full text-orange-900 inline-flex items-center gap-0.5"
                  style={{
                    background: 'rgba(254,215,170,0.55)',
                    border: '1px solid rgba(251,191,36,0.45)',
                  }}
                >
                  <Flame className="w-3 h-3" />
                  רצף {task.current_streak}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-1.5 mt-3">
          <StatCell label="ביצועים" value={String(task.total_executions_in_range)} accent="emerald" />
          <StatCell label="הצלחה" value={`${task.success_rate_pct}%`} accent="emerald" />
          <StatCell label="חלקי" value={String(task.partial_days_in_range)} accent="amber" />
          <StatCell label="פספוס" value={String(task.missed_days_in_range)} accent="rose" />
        </div>

        {encouragement ? (
          <p
            className="text-[10px] font-semibold text-emerald-900/80 mt-2 text-right px-1"
            style={{
              background: 'rgba(254,252,232,0.55)',
              borderRadius: 10,
              padding: '4px 8px',
            }}
          >
            {encouragement}
          </p>
        ) : null}
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
            <div
              className="px-4 pb-4 space-y-3 pt-3"
              style={{ borderTop: '1px solid rgba(167,243,208,0.35)' }}
            >
              {/* Glass meta block */}
              <div
                className="rounded-2xl p-3 space-y-2"
                style={{
                  background:
                    'linear-gradient(170deg, rgba(220,252,231,0.65) 0%, rgba(254,252,232,0.45) 100%)',
                  border: '1px solid rgba(167,243,208,0.5)',
                  boxShadow: 'inset 0 1px 0 rgba(236,253,245,0.85)',
                  backdropFilter: 'blur(12px)',
                }}
              >
                <MetaRow
                  icon={<CalendarDays className="w-3.5 h-3.5" />}
                  label="קיבלתי על עצמי"
                  value={formatDateTime(task.accepted_at)}
                />
                <MetaRow
                  icon={<Clock className="w-3.5 h-3.5" />}
                  label="ביצוע ראשון"
                  value={formatDateTime(task.first_execution_at)}
                />
                <MetaRow
                  icon={<History className="w-3.5 h-3.5" />}
                  label="ביצוע אחרון"
                  value={formatDateTime(task.last_execution_at)}
                />
                {task.best_streak > 0 ? (
                  <MetaRow
                    icon={<Flame className="w-3.5 h-3.5" />}
                    label="שיא רצף"
                    value={`${task.best_streak} ימים`}
                  />
                ) : null}
              </div>

              {task.task_description ? (
                <p
                  className="text-xs text-emerald-900/75 leading-relaxed rounded-xl px-3 py-2"
                  style={{
                    background: 'rgba(220,252,231,0.45)',
                    border: '1px solid rgba(167,243,208,0.4)',
                  }}
                >
                  {task.task_description}
                </p>
              ) : null}

              {visibleDays.length > 0 ? (
                <div>
                  <p className="text-[10px] font-bold text-emerald-900/70 mb-2">יומן לפי יום</p>
                  <div className="space-y-2 max-h-[min(50vh,360px)] overflow-y-auto pr-0.5">
                    {visibleDays.map((day) => (
                      <DayRow key={day.date_key} day={day} todayKey={todayKey} />
                    ))}
                  </div>
                </div>
              ) : (
                <p
                  className="text-xs text-emerald-900/70 text-center py-3 rounded-xl"
                  style={{
                    background: 'rgba(220,252,231,0.45)',
                    border: '1px solid rgba(167,243,208,0.35)',
                  }}
                >
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
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div
      className="flex items-center justify-between gap-2 text-xs rounded-xl px-3 py-2"
      style={{
        background: 'rgba(236,253,245,0.55)',
        border: '1px solid rgba(167,243,208,0.35)',
      }}
    >
      <span className="font-bold tabular-nums text-emerald-900">{value}</span>
      <span className="flex items-center gap-1.5 text-emerald-900/75 font-semibold">
        {label}
        <span className="text-emerald-700">{icon}</span>
      </span>
    </div>
  );
}

function StatCell({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: 'emerald' | 'amber' | 'rose';
}) {
  const bg: Record<string, string> = {
    emerald: 'rgba(209,250,229,0.65)',
    amber: 'rgba(254,243,199,0.65)',
    rose: 'rgba(255,228,230,0.55)',
  };
  const border: Record<string, string> = {
    emerald: 'rgba(110,231,183,0.4)',
    amber: 'rgba(251,191,36,0.4)',
    rose: 'rgba(251,113,133,0.35)',
  };
  const text: Record<string, string> = {
    emerald: 'text-emerald-900',
    amber: 'text-amber-900',
    rose: 'text-rose-800/90',
  };
  return (
    <div
      className="rounded-xl px-1.5 py-2 text-center"
      style={{ background: bg[accent], border: `1px solid ${border[accent]}` }}
    >
      <p className="text-[9px] font-bold text-emerald-900/60">{label}</p>
      <p className={`text-sm font-black ${text[accent]}`}>{value}</p>
    </div>
  );
}

/* ── Main client ────────────────────────────────────────────────── */
export function TaskHistoryClient({
  userId,
  initialReport,
}: {
  userId: string;
  initialReport: TaskHistoryReport;
}) {
  const [report, setReport] = useState<TaskHistoryReport>(initialReport);
  const [range, setRange] = useState<TaskHistoryRange>(initialReport.meta.range);
  const [loading, setLoading] = useState(false);
  /** רענון לייב בלי loader גלוי — כדי שה-UI לא יכבה בכל סימון */
  const [liveRefreshing, setLiveRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [popupDateKey, setPopupDateKey] = useState<string | null>(null);

  const todayKey = jerusalemTodayKey();

  const fetchReport = useCallback(
    async (next: TaskHistoryRange, opts: { silent?: boolean } = {}) => {
      if (opts.silent) setLiveRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/v1/task-history?range=${next}`, {
          credentials: 'include',
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? `שגיאה ${res.status}`);
        }
        const data = (await res.json()) as TaskHistoryReport;
        setReport(data);
      } catch (e) {
        if (!opts.silent) setError(e instanceof Error ? e.message : 'טעינה נכשלה');
      } finally {
        if (opts.silent) setLiveRefreshing(false);
        else setLoading(false);
      }
    },
    []
  );

  const loadRange = useCallback(
    async (next: TaskHistoryRange) => {
      setRange(next);
      await fetchReport(next);
    },
    [fetchReport]
  );

  /**
   * עדכון לייב: רענון שקט (ללא loader) של אותה תקופה שמוצגת —
   * מבטיח שמשימות וביצועים מהיום מופיעים תוך פחות משנייה גם בלי לחזור למסך.
   */
  const rangeRef = useRef(range);
  rangeRef.current = range;
  useProgressLiveRefresh(userId, () => {
    void fetchReport(rangeRef.current, { silent: true });
  });

  /** מצביע על "מסונכרן" קצרה אחרי כל רענון לייב — חיווי ויזואלי קטן ומעודן */
  const [justSynced, setJustSynced] = useState(false);
  useEffect(() => {
    if (!liveRefreshing && justSynced) {
      const id = setTimeout(() => setJustSynced(false), 1200);
      return () => clearTimeout(id);
    }
    if (liveRefreshing) setJustSynced(true);
  }, [liveRefreshing, justSynced]);

  /** Build popup rows for a given dateKey from all tasks */
  const popupRows = useMemo((): DayExecRow[] => {
    if (!popupDateKey) return [];
    const rows: DayExecRow[] = [];
    for (const task of report.tasks) {
      const day = task.days.find((d) => d.date_key === popupDateKey);
      if (!day) continue;
      for (const ex of day.executions) {
        rows.push({
          task_id: task.task_id,
          task_title: task.task_title,
          task_emoji: task.task_emoji,
          step_number: task.step_number,
          step_title: task.step_title,
          slot: ex.slot,
          completed_at: ex.completed_at,
          source: ex.source,
        });
      }
    }
    return rows.sort((a, b) => a.completed_at.localeCompare(b.completed_at));
  }, [popupDateKey, report.tasks]);

  const { meta, tasks, rejected_tasks: rejected } = report;
  const showTimeline = range !== 'day' && tasks.length > 0;

  return (
    <div className="min-h-screen pb-6" style={{ background: '#EDF5F0' }}>
      {/* Header */}
      <div
        className="-mt-16 pt-16 pb-5 px-4"
        style={{ background: 'linear-gradient(160deg, #064e3b 0%, #047857 50%, #10b981 100%)' }}
      >
        <div className="flex items-center gap-3 mb-3">
          <Link
            href="/progress"
            className="flex h-9 w-9 items-center justify-center rounded-xl text-emerald-50"
            style={{
              background: 'rgba(220,252,231,0.2)',
              border: '1px solid rgba(167,243,208,0.35)',
            }}
            aria-label="חזרה להתקדמות"
          >
            <ArrowRight className="w-5 h-5" />
          </Link>
          <div className="min-w-0 flex-1 text-right">
            <p className="text-emerald-100/80 text-xs font-semibold">מעקב מפורט</p>
            <h1
              className="text-xl font-black text-emerald-50 leading-tight"
              style={{ fontFamily: "'Rubik','Heebo',sans-serif" }}
            >
              היסטוריית משימות
            </h1>
          </div>
        </div>
        <p className="text-emerald-100/85 text-sm leading-relaxed pr-12">
          מתי קיבלת · מתי התחלת · הצלחות ופספוסים — לפי תאריך ושעה
        </p>
      </div>

      <div className="container-mobile -mt-3 space-y-4 relative z-[1]">
        <AlmogScreenCoach
          title="אלמוג קורא את ההיסטוריה"
          body="המספרים כאן לא נועדו לשפוט. אפשר לבקש מאלמוג לזהות דפוס, להבין איפה זה נשבר, ולהציע שינוי קטן למשימה."
          prompt="אלמוג, תסתכל איתי על היסטוריית המשימות שלי. איזה דפוס אתה רואה ומה שינוי קטן שכדאי לעשות?"
          cta="נתח איתי את הדפוס"
        />

        {/* Period tabs */}
        <div className="rounded-[22px] p-2" style={glassCard}>
          <div className="flex gap-1 overflow-x-auto pb-0.5 scrollbar-hide">
            {PERIOD_TABS.map((tab) => {
              const active = range === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  disabled={loading}
                  onClick={() => void loadRange(tab.id)}
                  className={`shrink-0 min-w-[52px] px-3 py-2 rounded-xl text-xs font-black transition disabled:opacity-60 ${
                    active
                      ? 'text-emerald-950 shadow-md'
                      : 'text-emerald-900/75'
                  }`}
                  style={
                    active
                      ? {
                          background:
                            'linear-gradient(135deg, rgba(167,243,208,0.9), rgba(110,231,183,0.75))',
                          border: '1px solid rgba(52,211,153,0.5)',
                          boxShadow: '0 4px 14px rgba(6,78,59,0.15)',
                        }
                      : {
                          background: 'rgba(220,252,231,0.55)',
                          border: '1px solid rgba(167,243,208,0.4)',
                        }
                  }
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
          <p className="text-[10px] font-semibold text-emerald-900/70 text-center mt-2 px-1 flex items-center justify-center gap-1.5">
            <span>
              {meta.label}
              {meta.range !== 'day' ? ` · ${meta.from} — ${meta.to}` : ''}
            </span>
            <AnimatePresence>
              {liveRefreshing ? (
                <motion.span
                  key="sync-indicator"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="inline-flex items-center gap-1 text-emerald-700"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  לייב
                </motion.span>
              ) : justSynced ? (
                <motion.span
                  key="synced-indicator"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="inline-flex items-center gap-1 text-emerald-700"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  סונכרן
                </motion.span>
              ) : null}
            </AnimatePresence>
          </p>
        </div>

        {error ? (
          <div
            className="rounded-2xl px-4 py-3 text-sm font-medium text-center text-rose-900"
            style={{
              background: 'rgba(255,228,230,0.7)',
              border: '1px solid rgba(251,113,133,0.35)',
            }}
          >
            {error}
          </div>
        ) : null}

        {/* Stats */}
        <div className="grid grid-cols-2 gap-2.5">
          <StatMini label="משימות פעילות" value={String(report.total_accepted_lifetime)} />
          <StatMini label="ביצועים בתקופה" value={String(report.total_executions_in_range)} />
          <StatMini label="ימים פעילים" value={String(report.active_days_in_range)} />
          <StatMini label="אחוז הצלחה" value={`${report.overall_success_rate_pct}%`} highlight />
        </div>

        {/* Period timeline — week/month/year/all */}
        {showTimeline ? (
          <PeriodTimeline
            tasks={tasks}
            todayKey={todayKey}
            onSelectDay={setPopupDateKey}
            activeKey={popupDateKey}
          />
        ) : null}

        {/* Task list */}
        {tasks.length === 0 ? (
          <div className="rounded-[22px] text-center py-14 px-4" style={glassCard}>
            <div className="text-5xl mb-3">📋</div>
            <h3 className="text-lg font-black text-emerald-950 mb-2">עדיין אין משימות מקובלות</h3>
            <p className="text-emerald-900/70 text-sm mb-6 leading-relaxed">
              במסע, לחץ &quot;מקובל עליי&quot; על משימה — וההיסטוריה תופיע כאן אוטומטית
            </p>
            <Link
              href="/journey"
              className="inline-flex items-center justify-center px-6 py-3 rounded-2xl font-bold text-emerald-950"
              style={{
                background: 'linear-gradient(135deg, rgba(167,243,208,0.9), rgba(110,231,183,0.8))',
                boxShadow: '0 8px 24px rgba(16,185,129,0.25)',
                border: '1px solid rgba(52,211,153,0.45)',
              }}
            >
              למסע שלי
            </Link>
          </div>
        ) : (
          <section className="space-y-3">
            <div className="flex items-center gap-2 px-0.5">
              <div className="w-1.5 h-6 rounded-full bg-gradient-to-b from-amber-400 to-emerald-600" />
              <h2 className="text-base font-black text-emerald-950">
                {tasks.length} משימות · {meta.label}
              </h2>
            </div>
            {tasks.map((task) => (
              <TaskCard key={task.task_id} task={task} todayKey={todayKey} />
            ))}
          </section>
        )}

        {rejected.length > 0 ? (
          <section className="rounded-[22px] p-4" style={glassCard}>
            <div className="flex items-center gap-2 mb-3">
              <XCircle className="w-4 h-4 text-rose-600/80" />
              <h3 className="text-sm font-black text-emerald-950">לא מקובל ({rejected.length})</h3>
            </div>
            <ul className="space-y-2">
              {rejected.map((r) => (
                <li
                  key={r.task_id}
                  className="flex items-center justify-between gap-2 text-xs pb-2 last:border-0"
                  style={{ borderBottom: '1px solid rgba(167,243,208,0.3)' }}
                >
                  <span className="text-emerald-900/60 shrink-0 tabular-nums">
                    {r.rejected_at ? formatDateTime(r.rejected_at) : '—'}
                  </span>
                  <span className="font-medium text-emerald-950 text-right min-w-0 line-clamp-1">
                    {r.task_title}
                    <span className="text-emerald-900/55 font-normal"> · צעד {r.step_number}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>

      <DayDetailPopup
        open={Boolean(popupDateKey)}
        dateKey={popupDateKey}
        todayKey={todayKey}
        rows={popupRows}
        onClose={() => setPopupDateKey(null)}
      />
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
      className={`rounded-[22px] p-3 text-center ${highlight ? 'ring-2 ring-emerald-400/35' : ''}`}
      style={glassCard}
    >
      <p className="text-[10px] font-bold text-emerald-900/65 mb-0.5">{label}</p>
      <p className={`text-lg font-black ${highlight ? 'text-emerald-800' : 'text-emerald-950'}`}>
        {value}
      </p>
    </div>
  );
}
