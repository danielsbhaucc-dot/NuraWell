/**
 * Deterministic metric aggregation for the Memory Pyramid.
 *
 * חוק עליון: מתמטיקה כאן היא 100% דטרמיניסטית — לא LLM.
 * ה-LLM רק מקבל את `metrics` הסופיים + ה-`ai_insight` מהרמה הנמוכה.
 *
 * שתי קבוצות פונקציות:
 *   • `computeDailyMetrics`     — נקרא ישירות מ-`task_logs` (העלה).
 *   • `aggregateLowerMetrics`   — מקבץ JSONB של מטריקות "ילדים"
 *                                  (daily→weekly, weekly→monthly וכו') לרמת אב.
 */

import { DOW_NAMES, dayOfWeek, type DayOfWeek } from './period-keys';

// ─── טיפוסי מטריקות ────────────────────────────────────────────

export interface DailyMetrics {
  type: 'daily';
  date_key: string;
  day_of_week: DayOfWeek;
  completed: boolean;
  /** 1.0 אם הושלם, 0.0 אחרת — לאחידות עם רמות גבוהות. */
  completion_rate: number;
  completed_days: 1 | 0;
  missed_days: 1 | 0;
  total_days: 1;
  source: string | null;
  task_name: string | null;
  /** מינימליסטי בעלה — שאר השדות מתמלאים ברמות גבוהות. */
  start_date: string;
  end_date: string;
}

export interface AggregateMetrics {
  type: 'weekly' | 'monthly' | 'quarterly' | 'semi_annual' | 'annual';
  start_date: string;
  end_date: string;
  total_days: number;
  completed_days: number;
  missed_days: number;
  completion_rate: number;
  /** Streak פנימי (ארוך ביותר) של השלמות באותה תקופה. */
  max_streak: number;
  /** סך ימי "תקופות-ילדה" שנבדקו (= מספר children שנכנסו לחישוב). */
  children_count: number;
  /** ספירת החמצות לפי יום-בשבוע, לאיתור weakest_day גם ברמות גבוהות. */
  misses_by_dow: Record<DayOfWeek, number>;
  /** היום בשבוע עם הכי הרבה החמצות (רנדומלית במקרה תיקו — לפי סדר Sunday→Saturday). */
  weakest_day: DayOfWeek | null;
  /** המפתח של תקופת-הילדה הטובה ביותר (highest completion_rate). */
  best_child: string | null;
  /** המפתח של תקופת-הילדה הגרועה ביותר (lowest completion_rate). */
  worst_child: string | null;
}

export type SummaryMetrics = DailyMetrics | AggregateMetrics;

// ─── עוזרי DOW ─────────────────────────────────────────────────

function emptyDowCounts(): Record<DayOfWeek, number> {
  return {
    Sunday: 0,
    Monday: 0,
    Tuesday: 0,
    Wednesday: 0,
    Thursday: 0,
    Friday: 0,
    Saturday: 0,
  };
}

function pickWeakestDay(counts: Record<DayOfWeek, number>): DayOfWeek | null {
  let best: DayOfWeek | null = null;
  let bestCount = 0;
  for (const dow of DOW_NAMES) {
    if (counts[dow] > bestCount) {
      bestCount = counts[dow];
      best = dow;
    }
  }
  return bestCount > 0 ? best : null;
}

// ─── DAILY ─────────────────────────────────────────────────────

export interface TaskLogRow {
  date_key: string;
  task_name: string | null;
  source: string | null;
  completed_at: string | null;
}

/**
 * עלה הפירמידה: בודק האם יש רשומה ב-task_logs עבור היום הזה.
 * (השלמת משימה יומית = שורה אחת לכל user×date_key — לפי המיגרציה 000027.)
 */
export function computeDailyMetrics(
  dateKey: string,
  log: TaskLogRow | null
): DailyMetrics {
  const completed = Boolean(log);
  return {
    type: 'daily',
    date_key: dateKey,
    day_of_week: dayOfWeek(dateKey),
    completed,
    completion_rate: completed ? 1 : 0,
    completed_days: completed ? 1 : 0,
    missed_days: completed ? 0 : 1,
    total_days: 1,
    source: log?.source ?? null,
    task_name: log?.task_name ?? null,
    start_date: dateKey,
    end_date: dateKey,
  };
}

// ─── AGGREGATE (Weekly/Monthly/Quarterly/Semi/Annual) ──────────

/** רשומת ילד שנכנסת ל-aggregator. */
export interface ChildRecord {
  /** ה-period_key של הילד (e.g. '2026-05-29' או '2026-W22'). */
  periodKey: string;
  /** ה-metrics ה-JSONB של הילד (כפי שנשמר ב-DB). */
  metrics: SummaryMetrics;
  /** ה-AI insight של הילד — לא משפיע על המתמטיקה אבל זמין ל-LLM. */
  aiInsight?: string;
}

interface AggregateInput {
  type: AggregateMetrics['type'];
  startDate: string;
  endDate: string;
  children: ChildRecord[];
}

/**
 * מצרף ילדים → מטריקה אגרגטיבית. עובד אחיד מה-daily ועד ה-annual.
 *
 * חישובים:
 *   • completed_days / missed_days / total_days — סכום פשוט מהילדים.
 *   • completion_rate — משוקלל ע"י total_days של הילדים.
 *   • max_streak — מקסימום בין הילדים (אנו מחשבים ברמת weekly מה-daily-flags;
 *     ברמות גבוהות יותר זה הקרוב ביותר שיש לנו בלי לרדת לעלים).
 *   • misses_by_dow — אם הילדים מספקים misses_by_dow → סכום. אחרת
 *     (כשהילדים הם daily) → נספר ידנית ע"פ day_of_week של ימים שלא הושלמו.
 *   • best_child / worst_child — לפי completion_rate.
 */
export function aggregateLowerMetrics(input: AggregateInput): AggregateMetrics {
  const { type, startDate, endDate, children } = input;
  const dowCounts = emptyDowCounts();

  let completed_days = 0;
  let missed_days = 0;
  let total_days = 0;
  let max_streak = 0;
  let best_child: string | null = null;
  let worst_child: string | null = null;
  let bestRate = -1;
  let worstRate = 2;

  // streak ב-weekly: יושב על דיגומים יומיים. ברמות גבוהות יותר זה
  // אגרגציה של max_streak מהילדים (קירוב — אבל מספיק לתובנות).
  const dailyRunFlags: boolean[] = [];

  for (const child of children) {
    const m = child.metrics;
    completed_days += m.completed_days;
    missed_days += m.missed_days;
    total_days += m.total_days;

    if (m.type === 'daily') {
      dailyRunFlags.push(m.completed);
      if (!m.completed) {
        dowCounts[m.day_of_week] += 1;
      }
    } else {
      // ילדים אגרגטיביים — סוכמים את הבריקדאון שלהם.
      for (const dow of DOW_NAMES) {
        dowCounts[dow] += m.misses_by_dow[dow] ?? 0;
      }
      max_streak = Math.max(max_streak, m.max_streak);
    }

    const rate = m.completion_rate;
    if (rate > bestRate) {
      bestRate = rate;
      best_child = child.periodKey;
    }
    if (rate < worstRate) {
      worstRate = rate;
      worst_child = child.periodKey;
    }
  }

  // streak מ-daily flags (רלוונטי רק ל-weekly).
  if (dailyRunFlags.length > 0) {
    let cur = 0;
    for (const ok of dailyRunFlags) {
      if (ok) {
        cur += 1;
        if (cur > max_streak) max_streak = cur;
      } else {
        cur = 0;
      }
    }
  }

  const completion_rate = total_days > 0 ? completed_days / total_days : 0;

  return {
    type,
    start_date: startDate,
    end_date: endDate,
    total_days,
    completed_days,
    missed_days,
    completion_rate: Math.round(completion_rate * 1000) / 1000,
    max_streak,
    children_count: children.length,
    misses_by_dow: dowCounts,
    weakest_day: pickWeakestDay(dowCounts),
    best_child,
    worst_child,
  };
}
