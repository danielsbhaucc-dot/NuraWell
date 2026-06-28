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
  Target,
  TrendingUp,
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
import { AlmogAvatarChipWithNameTag } from '../journey/AlmogPresence';
import { DayDetailPopup, type DayExecRow } from '../tasks/DayDetailPopup';
import { formatHebrewRelativeFromDateKey } from '../../lib/time/hebrew-relative';
import { getPersonalGreeting } from '../../lib/time/greeting';
import {
  historyPageGreeting,
  historyPageAlmogHeroBody,
  historyPageSuccessEncouragement,
  type ProfileGender,
} from '../../lib/profile/personalized-copy';

/* ── Design tokens ───────────────────────────────────────────────── */
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

const hebrewFont = "'Rubik','Heebo',sans-serif";

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } },
};
const itemAnim = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.28, ease: 'easeOut' } },
};

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

/* ── Section header — matches ProgressPageClient style ──────────── */
type StripeTone = 'teal' | 'indigo' | 'emerald' | 'amber';

function HistorySectionHeader({
  title,
  subtitle,
  tone,
  icon: Icon,
}: {
  title: string;
  subtitle?: string;
  tone: StripeTone;
  icon?: React.ElementType;
}) {
  const iconBg: Record<StripeTone, string> = {
    teal: 'rgba(20,184,166,0.12)',
    indigo: 'rgba(99,102,241,0.10)',
    emerald: 'rgba(16,185,129,0.10)',
    amber: 'rgba(245,158,11,0.12)',
  };
  const iconColor: Record<StripeTone, string> = {
    teal: '#0f766e',
    indigo: '#6366f1',
    emerald: '#059669',
    amber: '#d97706',
  };
  return (
    <div className="progress-section-header">
      <span className={`progress-section-stripe progress-section-stripe-${tone}`} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {Icon ? (
            <span
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
              style={{ background: iconBg[tone] }}
            >
              <Icon
                className="h-3.5 w-3.5"
                strokeWidth={2.2}
                style={{ color: iconColor[tone] }}
              />
            </span>
          ) : null}
          <h2
            className="text-[15px] font-black text-[#1A1730] leading-tight"
            style={{ fontFamily: hebrewFont }}
          >
            {title}
          </h2>
        </div>
        {subtitle ? (
          <p className="mt-0.5 text-xs font-medium text-[#9896B8] leading-relaxed">{subtitle}</p>
        ) : null}
      </div>
    </div>
  );
}

const DIVIDER_COLORS: Record<StripeTone, { lineStrong: string; lineSoft: string; dot: string }> = {
  teal: { lineStrong: 'rgba(20,184,166,0.28)', lineSoft: 'rgba(4,120,87,0.10)', dot: '#14b8a6' },
  indigo: { lineStrong: 'rgba(99,102,241,0.26)', lineSoft: 'rgba(129,140,248,0.10)', dot: '#818cf8' },
  emerald: { lineStrong: 'rgba(16,185,129,0.28)', lineSoft: 'rgba(52,211,153,0.10)', dot: '#34d399' },
  amber: { lineStrong: 'rgba(245,158,11,0.30)', lineSoft: 'rgba(251,191,36,0.12)', dot: '#fbbf24' },
};

const DIVIDER_TEXT: Record<StripeTone, { title: string; subtitle: string }> = {
  teal: { title: '#0f766e', subtitle: 'rgba(15,118,110,0.55)' },
  indigo: { title: '#6366f1', subtitle: 'rgba(99,102,241,0.55)' },
  emerald: { title: '#059669', subtitle: 'rgba(5,150,105,0.55)' },
  amber: { title: '#d97706', subtitle: 'rgba(217,119,6,0.55)' },
};

function HistorySectionDivider({
  tone,
  title,
  subtitle,
}: {
  tone: StripeTone;
  title?: string;
  subtitle?: string;
}) {
  const c = DIVIDER_COLORS[tone];
  const tc = DIVIDER_TEXT[tone];
  if (!title) {
    return (
      <div dir="rtl" className="py-1.5" role="presentation" aria-hidden>
        <div className="flex items-center gap-3">
          <div className="h-px flex-1" style={{ background: `linear-gradient(90deg, transparent, ${c.lineStrong} 40%, ${c.lineSoft})` }} />
          <div className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: c.dot, boxShadow: `0 0 10px ${c.dot}55` }} />
          <div className="h-px flex-1" style={{ background: `linear-gradient(270deg, transparent, ${c.lineStrong} 40%, ${c.lineSoft})` }} />
        </div>
      </div>
    );
  }
  return (
    <div dir="rtl" className="py-1.5" role="separator" aria-label={title}>
      <div className="flex items-center gap-3">
        <div className="h-px flex-1" style={{ background: `linear-gradient(90deg, transparent, ${c.lineStrong} 50%, ${c.lineSoft})` }} />
        <div className="shrink-0 px-1 text-center">
          <p className="text-[11px] font-black tracking-wide" style={{ color: tc.title, fontFamily: hebrewFont }}>{title}</p>
          {subtitle ? (
            <p className="mt-0.5 text-[10px] font-semibold leading-relaxed" style={{ color: tc.subtitle }}>{subtitle}</p>
          ) : null}
        </div>
        <div className="h-px flex-1" style={{ background: `linear-gradient(270deg, transparent, ${c.lineStrong} 50%, ${c.lineSoft})` }} />
      </div>
    </div>
  );
}

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
    <div className="rounded-2xl p-3" style={{ background: 'rgba(220,252,231,0.45)', border: '1px solid rgba(167,243,208,0.45)' }}>
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
              <span className={`h-3 w-3 rounded-full ${AGG_DOT[agg]} ${isToday ? 'ring-2 ring-sky-300/70' : ''}`} />
              <span className="text-[9px] font-bold text-emerald-900/80">{dateKey.slice(8)}</span>
              {totalExec > 0 ? (
                <span className="text-[8px] font-black text-emerald-800">{totalExec}</span>
              ) : null}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-2 justify-end mt-2 text-[9px] font-semibold text-emerald-900/70">
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" />הושלם</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500" />חלקי</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-sky-400" />בתהליך</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-sky-300" />פתוח</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-rose-300/85" />פספוס</span>
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
    <div className={`rounded-2xl px-3 py-2.5 border ${st.border}`} style={{ background: st.bg }}>
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
            <ChevronDown className={`w-3.5 h-3.5 text-emerald-800/60 transition-transform ${open ? 'rotate-180' : ''}`} />
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
            <ul className="mt-2 space-y-1.5 pt-2" style={{ borderTop: '1px solid rgba(167,243,208,0.4)' }}>
              {day.executions.map((ex, i) => (
                <li key={`${ex.slot}-${ex.completed_at}-${i}`} className="flex items-center justify-between gap-2 text-[11px]">
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
function TaskCard({
  task,
  todayKey,
  gender,
}: {
  task: TaskHistoryEntry;
  todayKey: string;
  gender: ProfileGender;
}) {
  const [expanded, setExpanded] = useState(false);
  const visibleDays = task.days.filter(
    (d) => d.status !== 'off' && d.status !== 'before_accept'
  );

  const encouragement =
    task.missed_days_in_range === 0 && task.active_days_in_range > 0
      ? '✨ הכל מתועד — כל יום שנחשב נמצא כאן'
      : task.current_streak >= 3
        ? `🔥 ${task.current_streak} ימים ברצף — זה בדיוק איך הרגל נבנה`
        : task.partial_days_in_range > 0
          ? `כל צעד קטן נחשב — גם ${task.partial_days_in_range} ימים חלקיים מצביעים על תנועה`
          : task.pending_days_in_range > 0
            ? 'היום עוד פתוח — אפשר להשלים עכשיו'
            : task.missed_days_in_range > 0 && gender === 'female'
              ? 'אל תוותרי — כל יום חדש הוא הזדמנות חדשה'
              : task.missed_days_in_range > 0
                ? 'אל תוותר — כל יום חדש הוא הזדמנות חדשה'
                : null;

  return (
    <article className="rounded-[24px] overflow-hidden" style={glassTaskCard}>
      <button type="button" onClick={() => setExpanded((v) => !v)} className="w-full p-4 text-right">
        <div className="flex items-start gap-3 flex-row-reverse">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-2xl"
            style={{
              background: 'linear-gradient(145deg, rgba(220,252,231,0.9), rgba(254,252,232,0.65))',
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
                style={{ background: 'rgba(167,243,208,0.55)', border: '1px solid rgba(110,231,183,0.4)' }}
              >
                {task.schedule_label}
              </span>
              {task.schedule === 'one_time' && task.execution_done ? (
                <span
                  className="text-[10px] font-bold px-2 py-0.5 rounded-full text-teal-900"
                  style={{ background: 'rgba(153,246,228,0.55)', border: '1px solid rgba(94,234,212,0.45)' }}
                >
                  בוצע ✓
                </span>
              ) : null}
              {task.current_streak > 0 ? (
                <span
                  className="text-[10px] font-bold px-2 py-0.5 rounded-full text-orange-900 inline-flex items-center gap-0.5"
                  style={{ background: 'rgba(254,215,170,0.55)', border: '1px solid rgba(251,191,36,0.45)' }}
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
            className="text-[11px] font-semibold text-emerald-900/85 mt-2.5 text-right rounded-xl px-3 py-2"
            style={{ background: 'rgba(236,253,245,0.7)', border: '1px solid rgba(167,243,208,0.4)' }}
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
            <div className="px-4 pb-4 space-y-3 pt-3" style={{ borderTop: '1px solid rgba(167,243,208,0.35)' }}>
              <div
                className="rounded-2xl p-3 space-y-2"
                style={{
                  background: 'linear-gradient(170deg, rgba(220,252,231,0.65) 0%, rgba(254,252,232,0.45) 100%)',
                  border: '1px solid rgba(167,243,208,0.5)',
                  boxShadow: 'inset 0 1px 0 rgba(236,253,245,0.85)',
                  backdropFilter: 'blur(12px)',
                }}
              >
                <MetaRow icon={<CalendarDays className="w-3.5 h-3.5" />} label="קיבלתי על עצמי" value={formatDateTime(task.accepted_at)} />
                <MetaRow icon={<Clock className="w-3.5 h-3.5" />} label="ביצוע ראשון" value={formatDateTime(task.first_execution_at)} />
                <MetaRow icon={<History className="w-3.5 h-3.5" />} label="ביצוע אחרון" value={formatDateTime(task.last_execution_at)} />
                {task.best_streak > 0 ? (
                  <MetaRow icon={<Flame className="w-3.5 h-3.5" />} label="שיא רצף" value={`${task.best_streak} ימים`} />
                ) : null}
              </div>

              {task.task_description ? (
                <p
                  className="text-xs text-emerald-900/75 leading-relaxed rounded-xl px-3 py-2"
                  style={{ background: 'rgba(220,252,231,0.45)', border: '1px solid rgba(167,243,208,0.4)' }}
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
                  style={{ background: 'rgba(220,252,231,0.45)', border: '1px solid rgba(167,243,208,0.35)' }}
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

function MetaRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div
      className="flex items-center justify-between gap-2 text-xs rounded-xl px-3 py-2"
      style={{ background: 'rgba(236,253,245,0.55)', border: '1px solid rgba(167,243,208,0.35)' }}
    >
      <span className="font-bold tabular-nums text-emerald-900">{value}</span>
      <span className="flex items-center gap-1.5 text-emerald-900/75 font-semibold">
        {label}
        <span className="text-emerald-700">{icon}</span>
      </span>
    </div>
  );
}

function StatCell({ label, value, accent }: { label: string; value: string; accent: 'emerald' | 'amber' | 'rose' }) {
  const bg: Record<string, string> = { emerald: 'rgba(209,250,229,0.65)', amber: 'rgba(254,243,199,0.65)', rose: 'rgba(255,228,230,0.55)' };
  const border: Record<string, string> = { emerald: 'rgba(110,231,183,0.4)', amber: 'rgba(251,191,36,0.4)', rose: 'rgba(251,113,133,0.35)' };
  const text: Record<string, string> = { emerald: 'text-emerald-900', amber: 'text-amber-900', rose: 'text-rose-800/90' };
  return (
    <div className="rounded-xl px-1.5 py-2 text-center" style={{ background: bg[accent], border: `1px solid ${border[accent]}` }}>
      <p className="text-[9px] font-bold text-emerald-900/60">{label}</p>
      <p className={`text-sm font-black ${text[accent]}`}>{value}</p>
    </div>
  );
}

/* ── Main client ────────────────────────────────────────────────── */
export function TaskHistoryClient({
  userId,
  firstName = 'חבר',
  gender = null,
  initialReport,
}: {
  userId: string;
  firstName?: string;
  gender?: ProfileGender;
  initialReport: TaskHistoryReport;
}) {
  const [report, setReport] = useState<TaskHistoryReport>(initialReport);
  const [range, setRange] = useState<TaskHistoryRange>(initialReport.meta.range);
  const [loading, setLoading] = useState(false);
  const [liveRefreshing, setLiveRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [popupDateKey, setPopupDateKey] = useState<string | null>(null);

  const todayKey = jerusalemTodayKey();
  const greeting = useMemo(() => getPersonalGreeting(new Date()), []);
  const heroSeed = useMemo(
    () => new Date().getDate() + report.total_accepted_lifetime + report.total_executions_in_range,
    [report.total_accepted_lifetime, report.total_executions_in_range]
  );
  const almogHeroBody = historyPageAlmogHeroBody(gender, firstName, heroSeed);

  const fetchReport = useCallback(
    async (next: TaskHistoryRange, opts: { silent?: boolean } = {}) => {
      if (opts.silent) setLiveRefreshing(true);
      else setLoading(true);
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

  const rangeRef = useRef(range);
  rangeRef.current = range;
  useProgressLiveRefresh(userId, () => {
    void fetchReport(rangeRef.current, { silent: true });
  });

  const [justSynced, setJustSynced] = useState(false);
  useEffect(() => {
    if (!liveRefreshing && justSynced) {
      const id = setTimeout(() => setJustSynced(false), 1200);
      return () => clearTimeout(id);
    }
    if (liveRefreshing) setJustSynced(true);
  }, [liveRefreshing, justSynced]);

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
  const successEncouragement = historyPageSuccessEncouragement(gender, report.overall_success_rate_pct);

  const statsGrid = [
    {
      label: 'משימות פעילות',
      value: String(report.total_accepted_lifetime),
      icon: Target,
      iconBg: 'rgba(20,184,166,0.12)',
      iconColor: '#0f766e',
    },
    {
      label: 'ביצועים בתקופה',
      value: String(report.total_executions_in_range),
      icon: CheckCircle2,
      iconBg: 'rgba(99,102,241,0.10)',
      iconColor: '#6366f1',
    },
    {
      label: 'ימים פעילים',
      value: String(report.active_days_in_range),
      icon: CalendarDays,
      iconBg: 'rgba(245,158,11,0.12)',
      iconColor: '#d97706',
    },
    {
      label: 'אחוז הצלחה',
      value: `${report.overall_success_rate_pct}%`,
      icon: TrendingUp,
      iconBg: 'rgba(249,115,22,0.10)',
      iconColor: '#ea580c',
    },
  ];

  return (
    <div className="min-h-full bg-dashboard" dir="rtl">
      {/* ─── Hero Header ─── */}
      <motion.header
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="-mt-16 relative overflow-hidden pt-16"
        style={{
          background:
            'linear-gradient(155deg, #034d3a 0%, #059669 35%, #0d9488 65%, #10b981 85%, #34d399 100%)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2)',
          isolation: 'isolate',
        }}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-2/3"
          style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0) 100%)' }}
        />
        <span
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-12 h-48 w-48 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.28), transparent 68%)' }}
        />
        <span
          aria-hidden
          className="pointer-events-none absolute -bottom-10 -left-16 h-56 w-56 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(45,212,191,0.45), transparent 70%)' }}
        />

        <div className="relative z-10 px-5 pb-[4.5rem] pt-3">
          {/* Back button + avatar row */}
          <div className="flex items-center justify-between mb-3">
            <div className="-mt-3">
              <AlmogAvatarChipWithNameTag size={92} nameTagVariant="prominent" />
            </div>
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
          </div>

          {/* Greeting + title */}
          <div className="text-right">
            <p
              className="text-[15px] font-black text-white leading-tight"
              style={{ fontFamily: hebrewFont }}
            >
              {historyPageGreeting(firstName)}
            </p>
            {greeting.occasionGreeting ? (
              <p
                className="mt-1 text-xs font-bold leading-relaxed"
                style={{
                  color:
                    greeting.tone === 'festive'
                      ? '#FFD97D'
                      : greeting.tone === 'solemn'
                        ? 'rgba(255,255,255,0.78)'
                        : 'rgba(255,255,255,0.92)',
                  fontStyle: greeting.tone === 'solemn' ? 'italic' : 'normal',
                }}
              >
                {greeting.occasionGreeting}
              </p>
            ) : (
              <p className="mt-1 text-xs font-semibold text-white/80">
                {greeting.timeGreeting.replace(/,$/, '')}
              </p>
            )}
            <h1
              className="mt-2 text-2xl font-black text-white tracking-tight"
              style={{ fontFamily: hebrewFont }}
            >
              היסטוריית משימות
            </h1>
            <p
              className="mt-2 text-sm font-black leading-relaxed"
              style={{ color: '#FFFDE7', fontFamily: "'Rubik', 'Heebo', sans-serif" }}
            >
              {almogHeroBody}
            </p>
          </div>
        </div>
      </motion.header>

      <div className="container-mobile relative z-[3] -mt-[7.5rem] pb-10 space-y-7">
        {/* ─── Stats grid (4 cards — same as progress page) ─── */}
        <section>
          <motion.div
            variants={container}
            initial="hidden"
            animate="show"
            className="grid grid-cols-2 gap-3"
          >
            {statsGrid.map((s) => (
              <motion.div
                key={s.label}
                variants={itemAnim}
                className="progress-glass-stat rounded-2xl p-4 flex flex-col items-center justify-center gap-2.5 text-center"
              >
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-xl"
                  style={{ background: s.iconBg }}
                >
                  <s.icon className="h-[18px] w-[18px]" strokeWidth={2.2} style={{ color: s.iconColor }} />
                </div>
                <div>
                  <p className="text-xl font-black text-[#1A1730] leading-none tabular-nums">
                    {s.value}
                  </p>
                  <p className="mt-1 text-[11px] font-semibold text-[#9896B8]">{s.label}</p>
                </div>
              </motion.div>
            ))}
          </motion.div>

          {/* Success encouragement chip */}
          {successEncouragement ? (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.3 }}
              className="mt-3 rounded-2xl px-4 py-3 text-right text-sm font-bold text-teal-900"
              style={{
                background: 'linear-gradient(135deg, rgba(167,243,208,0.7), rgba(110,231,183,0.5))',
                border: '1px solid rgba(52,211,153,0.4)',
                boxShadow: '0 4px 16px rgba(6,78,59,0.08)',
              }}
            >
              {successEncouragement}
            </motion.div>
          ) : null}
        </section>

        <HistorySectionDivider tone="teal" title="מבט על" subtitle="בחר תקופה לניתוח" />

        {/* ─── AlmogScreenCoach ─── */}
        <AlmogScreenCoach
          title="אלמוג קורא את ההיסטוריה"
          body="המספרים כאן לא נועדו לשפוט. אפשר לבקש מאלמוג לזהות דפוס, להבין איפה זה נשבר, ולהציע שינוי קטן למשימה."
          prompt="אלמוג, תסתכל איתי על היסטוריית המשימות שלי. איזה דפוס אתה רואה ומה שינוי קטן שכדאי לעשות?"
          cta="נתח איתי את הדפוס"
        />

        {/* ─── Period tabs ─── */}
        <section>
          <HistorySectionHeader
            title="תקופת הצגה"
            subtitle="בחר כמה זמן אחורה לראות"
            tone="indigo"
            icon={CalendarDays}
          />
          <div className="mt-3 crystal-surface rounded-2xl p-3">
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
                      active ? 'text-emerald-950 shadow-md' : 'text-emerald-900/75'
                    }`}
                    style={
                      active
                        ? {
                            background: 'linear-gradient(135deg, rgba(167,243,208,0.9), rgba(110,231,183,0.75))',
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
        </section>

        {error ? (
          <div
            className="rounded-2xl px-4 py-3 text-sm font-medium text-center text-rose-900"
            style={{ background: 'rgba(255,228,230,0.7)', border: '1px solid rgba(251,113,133,0.35)' }}
          >
            {error}
          </div>
        ) : null}

        {/* ─── Period timeline ─── */}
        {showTimeline ? (
          <>
            <HistorySectionDivider tone="amber" title="ציר זמן" subtitle="לפי ימים" />
            <PeriodTimeline
              tasks={tasks}
              todayKey={todayKey}
              onSelectDay={setPopupDateKey}
              activeKey={popupDateKey}
            />
          </>
        ) : null}

        {/* ─── Task list ─── */}
        {tasks.length === 0 ? (
          <>
            <HistorySectionDivider tone="emerald" title="משימות" subtitle="כל המשימות שלך" />
            <div className="rounded-[22px] text-center py-14 px-4" style={glassCard}>
              <div className="text-5xl mb-3">📋</div>
              <h3
                className="text-lg font-black text-emerald-950 mb-2"
                style={{ fontFamily: hebrewFont }}
              >
                עדיין אין משימות מקובלות
              </h3>
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
          </>
        ) : (
          <section className="space-y-3">
            <HistorySectionDivider tone="emerald" title="משימות" subtitle={`${tasks.length} משימות · ${meta.label}`} />
            <HistorySectionHeader
              title={`${tasks.length} משימות`}
              subtitle={meta.label}
              tone="emerald"
              icon={Target}
            />
            <div className="mt-3 space-y-3">
              {tasks.map((task) => (
                <TaskCard key={task.task_id} task={task} todayKey={todayKey} gender={gender} />
              ))}
            </div>
          </section>
        )}

        {/* ─── Rejected tasks ─── */}
        {rejected.length > 0 ? (
          <section>
            <HistorySectionDivider tone="teal" title="לא מקובל" />
            <div className="rounded-[22px] p-4" style={glassCard}>
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
            </div>
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
