/**
 * SummaryCard — תצוגת כרטיס יחיד של סיכום תקופתי.
 *
 * Pure presentational. מקבל row של `periodic_summaries` ועיצוב/פורמט בלבד.
 * נכלל ב-server וב-client (אין hooks, אין onClick).
 */

import {
  CalendarDays,
  CalendarRange,
  CalendarCheck,
  CalendarHeart,
  CalendarClock,
  Trophy,
  Flame,
  Target,
  TrendingDown,
} from 'lucide-react';
import type { SummaryType } from '../../lib/notifications/summaries/period-keys';
import type { PeriodicSummaryRow } from '../../app/(dashboard)/summaries/page';
import { formatHebrewRelative } from '../../lib/time/hebrew-relative';

interface MetricsShape {
  completion_rate?: number;
  completed_days?: number;
  missed_days?: number;
  total_days?: number;
  max_streak?: number;
  weakest_day?: string | null;
  best_child?: string | null;
  worst_child?: string | null;
  start_date?: string;
  end_date?: string;
}

const TYPE_LABEL_HE: Record<SummaryType, string> = {
  daily: 'יומי',
  weekly: 'שבועי',
  monthly: 'חודשי',
  quarterly: 'רבעוני',
  semi_annual: 'חצי-שנתי',
  annual: 'שנתי',
};

/** צבעים פר-type — קונסיסטנטי בכפתור יצירה ובכרטיס. */
export const TYPE_COLORS: Record<
  SummaryType,
  { bg: string; ring: string; text: string; icon: typeof CalendarDays; accent: string }
> = {
  daily: {
    bg: 'bg-emerald-50',
    ring: 'ring-emerald-200',
    text: 'text-emerald-700',
    accent: 'bg-emerald-500',
    icon: CalendarDays,
  },
  weekly: {
    bg: 'bg-sky-50',
    ring: 'ring-sky-200',
    text: 'text-sky-700',
    accent: 'bg-sky-500',
    icon: CalendarRange,
  },
  monthly: {
    bg: 'bg-violet-50',
    ring: 'ring-violet-200',
    text: 'text-violet-700',
    accent: 'bg-violet-500',
    icon: CalendarCheck,
  },
  quarterly: {
    bg: 'bg-amber-50',
    ring: 'ring-amber-200',
    text: 'text-amber-700',
    accent: 'bg-amber-500',
    icon: CalendarClock,
  },
  semi_annual: {
    bg: 'bg-rose-50',
    ring: 'ring-rose-200',
    text: 'text-rose-700',
    accent: 'bg-rose-500',
    icon: CalendarHeart,
  },
  annual: {
    bg: 'bg-indigo-50',
    ring: 'ring-indigo-200',
    text: 'text-indigo-700',
    accent: 'bg-indigo-500',
    icon: Trophy,
  },
};

const DOW_TO_HE: Record<string, string> = {
  Sunday: 'ראשון',
  Monday: 'שני',
  Tuesday: 'שלישי',
  Wednesday: 'רביעי',
  Thursday: 'חמישי',
  Friday: 'שישי',
  Saturday: 'שבת',
};

function formatPercent(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

function formatPeriodKeyHe(type: SummaryType, key: string): string {
  switch (type) {
    case 'daily':
      return key; // 2026-05-29 — ברור גם בעברית
    case 'weekly': {
      const m = key.match(/^(\d{4})-W(\d{2})$/);
      return m ? `שבוע ${Number(m[2])} ב-${m[1]}` : key;
    }
    case 'monthly': {
      const m = key.match(/^(\d{4})-M(\d{2})$/);
      if (!m) return key;
      const months = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
      return `${months[Number(m[2]) - 1] ?? m[2]} ${m[1]}`;
    }
    case 'quarterly': {
      const m = key.match(/^(\d{4})-Q([1-4])$/);
      return m ? `רבעון ${m[2]} ב-${m[1]}` : key;
    }
    case 'semi_annual': {
      const m = key.match(/^(\d{4})-H([12])$/);
      return m ? `חצי ${m[2]} של ${m[1]}` : key;
    }
    case 'annual':
      return `שנת ${key}`;
  }
}

export function SummaryCard({ summary }: { summary: PeriodicSummaryRow }) {
  const colors = TYPE_COLORS[summary.type];
  const Icon = colors.icon;
  const m = (summary.metrics ?? {}) as MetricsShape;
  const rate = typeof m.completion_rate === 'number' ? m.completion_rate : null;
  const streak = typeof m.max_streak === 'number' ? m.max_streak : null;
  const completed = typeof m.completed_days === 'number' ? m.completed_days : null;
  const total = typeof m.total_days === 'number' ? m.total_days : null;
  const weakest = m.weakest_day ?? null;

  return (
    <article
      className="glass-card p-5 transition-shadow hover:shadow-lg"
      dir="rtl"
      aria-label={`סיכום ${TYPE_LABEL_HE[summary.type]} ${summary.period_key}`}
    >
      {/* כותרת: סוג + תקופה + מטא */}
      <header className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-start gap-3 min-w-0">
          <div
            className={`shrink-0 w-11 h-11 rounded-2xl ring-1 ${colors.bg} ${colors.ring} flex items-center justify-center`}
          >
            <Icon className={`w-5 h-5 ${colors.text}`} strokeWidth={2.2} />
          </div>
          <div className="min-w-0">
            <p className={`text-xs font-bold uppercase tracking-wide ${colors.text}`}>
              סיכום {TYPE_LABEL_HE[summary.type]}
            </p>
            <h3 className="text-base font-extrabold text-gray-900 leading-tight truncate">
              {formatPeriodKeyHe(summary.type, summary.period_key)}
            </h3>
          </div>
        </div>
        <span className="shrink-0 text-[11px] text-gray-500 mt-1">
          {formatHebrewRelative(summary.created_at)}
        </span>
      </header>

      {/* AI insight — הכי בולט */}
      {summary.ai_insight && (
        <p className="text-[15px] leading-relaxed text-gray-800 whitespace-pre-line mb-4">
          {summary.ai_insight}
        </p>
      )}

      {/* Metrics row — chips קטנים, רק מה שיש */}
      {(rate !== null || streak !== null || weakest || (completed !== null && total !== null)) && (
        <div className="flex flex-wrap gap-2">
          {rate !== null && (
            <Chip icon={Target} label={`${formatPercent(rate)} השלמה`} tone="emerald" />
          )}
          {completed !== null && total !== null && (
            <Chip icon={CalendarCheck} label={`${completed}/${total} ימים`} tone="sky" />
          )}
          {streak !== null && streak > 0 && (
            <Chip icon={Flame} label={`${streak} ברצף`} tone="amber" />
          )}
          {weakest && (
            <Chip
              icon={TrendingDown}
              label={`יום חלש: ${DOW_TO_HE[weakest] ?? weakest}`}
              tone="rose"
            />
          )}
        </div>
      )}
    </article>
  );
}

interface ChipProps {
  icon: typeof CalendarDays;
  label: string;
  tone: 'emerald' | 'sky' | 'amber' | 'rose' | 'violet';
}

const CHIP_TONES: Record<ChipProps['tone'], { bg: string; text: string }> = {
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700' },
  sky: { bg: 'bg-sky-50', text: 'text-sky-700' },
  amber: { bg: 'bg-amber-50', text: 'text-amber-800' },
  rose: { bg: 'bg-rose-50', text: 'text-rose-700' },
  violet: { bg: 'bg-violet-50', text: 'text-violet-700' },
};

function Chip({ icon: Icon, label, tone }: ChipProps) {
  const t = CHIP_TONES[tone];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${t.bg} ${t.text}`}
    >
      <Icon className="w-3.5 h-3.5" strokeWidth={2.4} />
      {label}
    </span>
  );
}
