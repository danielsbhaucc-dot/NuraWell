/**
 * habit-progress.ts
 * -----------------
 * הרגל = מטרה. משימה = הפעולה. ההתקדמות נגזרת מביצוע משימות (journey_task_executions),
 * לא מסימון ידני של V על ההרגל.
 */

import {
  jerusalemDateKey,
  resolveTaskSchedule,
  slotsForSchedule,
} from './task-schedule';
import type { JourneyHabit, JourneyTask } from '../types/journey';

/** קלט פתוח של task_statuses — לא דורש `decided_at` (חלק מהקריאות API לא כוללות). */
export type TaskStatusInput = {
  status?: string;
  execution_done?: boolean;
};

export type HabitMetaEntry = {
  target_days: number;
  streak_current: number;
  streak_best: number;
  achieved_at: string | null;
  /** הארכה/קיצור ידני או ע"י אלמוג */
  adjusted_by?: 'user' | 'almog' | null;
  adjusted_at?: string | null;
};

export type HabitDayStatus = 'done' | 'missed' | 'pending' | 'inactive';

export type HabitProgressSnapshot = {
  habitId: string;
  targetDays: number;
  streakCurrent: number;
  streakBest: number;
  achieved: boolean;
  achievedAt: string | null;
  /** ימים אחרונים (ישן→חדש) לתצוגת לוח */
  recentDays: Array<{ dateKey: string; status: HabitDayStatus }>;
  /** כמה ימים רצופים נדרשים עוד */
  daysRemaining: number;
  /** אחוז התקדמות ליעד */
  percent: number;
};

export const DEFAULT_HABIT_TARGET_DAYS = 14;

type ExecutionLike = { task_id: string; date_key: string; slot: string };

function parseMeta(raw: unknown, habitId: string): HabitMetaEntry {
  const base: HabitMetaEntry = {
    target_days: DEFAULT_HABIT_TARGET_DAYS,
    streak_current: 0,
    streak_best: 0,
    achieved_at: null,
  };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base;
  const row = (raw as Record<string, unknown>)[habitId];
  if (!row || typeof row !== 'object' || Array.isArray(row)) return base;
  const m = row as Record<string, unknown>;
  return {
    target_days:
      typeof m.target_days === 'number' && m.target_days >= 3 && m.target_days <= 90
        ? Math.floor(m.target_days)
        : DEFAULT_HABIT_TARGET_DAYS,
    streak_current:
      typeof m.streak_current === 'number' && m.streak_current >= 0
        ? Math.floor(m.streak_current)
        : 0,
    streak_best:
      typeof m.streak_best === 'number' && m.streak_best >= 0 ? Math.floor(m.streak_best) : 0,
    achieved_at: typeof m.achieved_at === 'string' ? m.achieved_at : null,
    adjusted_by:
      m.adjusted_by === 'user' || m.adjusted_by === 'almog' ? m.adjusted_by : null,
    adjusted_at: typeof m.adjusted_at === 'string' ? m.adjusted_at : null,
  };
}

/** האם כל המשימות המקובלות והפעילות ביום מסוים הושלמו? */
function isStepTasksCompleteForDate(
  tasks: JourneyTask[],
  statuses: Record<string, TaskStatusInput>,
  executions: ReadonlyArray<ExecutionLike>,
  dateKey: string,
  referenceDate: Date
): boolean {
  const accepted = tasks.filter((t) => statuses[t.id]?.status === 'accepted');
  if (accepted.length === 0) return false;

  let anyActive = false;
  for (const t of accepted) {
    const { schedule, times_per_day } = resolveTaskSchedule(t);
    if (schedule === 'one_time') {
      if (statuses[t.id]?.execution_done === true) return true;
      continue;
    }
    const ref = new Date(referenceDate);
    if (schedule === 'weekly') {
      const { weekly_day } = resolveTaskSchedule(t);
      const wd = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Jerusalem',
        weekday: 'short',
      }).format(ref);
      const map: Record<string, number> = {
        Sun: 0,
        Mon: 1,
        Tue: 2,
        Wed: 3,
        Thu: 4,
        Fri: 5,
        Sat: 6,
      };
      if (map[wd] !== weekly_day) continue;
    }
    anyActive = true;
    const expected = slotsForSchedule(schedule, times_per_day);
    const doneSlots = new Set(
      executions
        .filter((e) => e.task_id === t.id && e.date_key === dateKey)
        .map((e) => e.slot)
    );
    if (!expected.every((sl) => doneSlots.has(sl))) return false;
  }
  return anyActive;
}

function addDaysToDateKey(dateKey: string, delta: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return jerusalemDateKey(dt);
}

function buildRecentDateKeys(todayKey: string, count: number): string[] {
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    out.push(addDaysToDateKey(todayKey, -i));
  }
  return out;
}

/**
 * מחשב התקדמות הרגל ממשימות מאותו צעד.
 */
export function computeHabitProgressSnapshot(options: {
  habit: JourneyHabit;
  stepTasks: JourneyTask[];
  taskStatuses: Record<string, TaskStatusInput>;
  executions: ReadonlyArray<ExecutionLike>;
  habitMeta?: unknown;
  todayKey?: string;
  historyDays?: number;
}): HabitProgressSnapshot {
  const todayKey = options.todayKey ?? jerusalemDateKey();
  const historyDays = options.historyDays ?? 21;
  const habitId = options.habit.id;
  const meta = parseMeta(options.habitMeta, habitId);
  const targetDays =
    typeof options.habit.target_days === 'number' && options.habit.target_days >= 3
      ? Math.min(90, Math.floor(options.habit.target_days))
      : meta.target_days;

  const dateKeys = buildRecentDateKeys(todayKey, historyDays);
  const recentDays: Array<{ dateKey: string; status: HabitDayStatus }> = [];

  for (const dk of dateKeys) {
    const ref = new Date(`${dk}T12:00:00+02:00`);
    if (dk === todayKey) {
      const complete = isStepTasksCompleteForDate(
        options.stepTasks,
        options.taskStatuses,
        options.executions,
        dk,
        ref
      );
      recentDays.push({ dateKey: dk, status: complete ? 'done' : 'pending' });
      continue;
    }
    const complete = isStepTasksCompleteForDate(
      options.stepTasks,
      options.taskStatuses,
      options.executions,
      dk,
      ref
    );
    recentDays.push({ dateKey: dk, status: complete ? 'done' : 'missed' });
  }

  let streakCurrent = 0;
  for (let i = recentDays.length - 1; i >= 0; i--) {
    const day = recentDays[i];
    if (day.status === 'done') {
      streakCurrent++;
    } else if (day.dateKey === todayKey && day.status === 'pending') {
      /** היום עדיין פתוח — לא שוברים את הרצף מאתמול */
      continue;
    } else {
      break;
    }
  }

  const streakBest = Math.max(meta.streak_best, streakCurrent);
  const achieved = meta.achieved_at != null || streakCurrent >= targetDays;
  const daysRemaining = Math.max(0, targetDays - streakCurrent);
  const percent = Math.min(100, Math.round((streakCurrent / targetDays) * 100));

  return {
    habitId,
    targetDays,
    streakCurrent,
    streakBest,
    achieved,
    achievedAt: meta.achieved_at,
    recentDays,
    daysRemaining,
    percent,
  };
}

/** האם הרגל "בוצע היום" לפי משימות (לשימוש ב-cron אלמוג). */
export function isHabitDoneTodayFromTasks(
  stepTasks: JourneyTask[],
  taskStatuses: Record<string, TaskStatusInput>,
  executions: ReadonlyArray<ExecutionLike>,
  todayKey: string = jerusalemDateKey()
): boolean {
  return isStepTasksCompleteForDate(
    stepTasks,
    taskStatuses,
    executions,
    todayKey,
    new Date()
  );
}

export type HabitTargetAdjustment = {
  /** סוג ההמלצה */
  kind: 'extend' | 'shorten' | 'achieve' | 'none';
  /** target_days חדש (אם kind!=none) */
  newTargetDays: number;
  /** הסיבה — לצורך הודעת אלמוג למשתמש */
  reason: string;
  /** עדכוני meta שצריך לעשות */
  metaPatch: Partial<HabitMetaEntry>;
};

/**
 * D4 — לוגיקה דינמית: אלמוג מאריך/מקצר את היעד לפי תבנית התמדה אמיתית.
 *
 *  - הגיע ליעד עם פחות מ-2 הפסקות → לסמן 'achieved' (יציבות חזקה).
 *  - 7 ימים אחרונים עם < 3 ביצועים → להאריך ב-3 ימים (לתת זמן).
 *  - 7 ימים אחרונים מושלם והמשתמש מעל 70% מהיעד → להציע "אתה מוכן מוקדם" → לקצר.
 *  - אחרת — אין שינוי.
 */
export function recommendHabitTargetAdjustment(
  snapshot: HabitProgressSnapshot,
  options?: {
    /** האם המשתמש כבר עשה התאמה ידנית ב-7 ימים אחרונים — לא נדרוס */
    userAdjustedRecently?: boolean;
  }
): HabitTargetAdjustment {
  if (options?.userAdjustedRecently) {
    return {
      kind: 'none',
      newTargetDays: snapshot.targetDays,
      reason: 'user_adjusted_recently',
      metaPatch: {},
    };
  }

  if (
    !snapshot.achieved &&
    snapshot.streakCurrent >= snapshot.targetDays
  ) {
    return {
      kind: 'achieve',
      newTargetDays: snapshot.targetDays,
      reason: `הגעת ליעד של ${snapshot.targetDays} ימים — ההרגל מקובע.`,
      metaPatch: {
        achieved_at: new Date().toISOString(),
        streak_best: Math.max(snapshot.streakBest, snapshot.streakCurrent),
      },
    };
  }

  /** חלון ניתוח: 7 הימים האחרונים (לפני היום). */
  const last7 = snapshot.recentDays.slice(-8, -1);
  const doneIn7 = last7.filter((d) => d.status === 'done').length;
  const missedIn7 = last7.filter((d) => d.status === 'missed').length;

  /** אם 5 מתוך 7 הימים האחרונים מושלמים והמשתמש קרוב לסיום → לאפשר קיצור (יציבות מהירה). */
  if (
    !snapshot.achieved &&
    doneIn7 >= 5 &&
    snapshot.streakCurrent >= Math.max(5, Math.floor(snapshot.targetDays * 0.6)) &&
    snapshot.targetDays > 7
  ) {
    const shorter = Math.max(7, snapshot.streakCurrent + 2);
    if (shorter < snapshot.targetDays) {
      return {
        kind: 'shorten',
        newTargetDays: shorter,
        reason: `שבוע עוקב של ביצוע יציב — אלמוג מקרב את היעד ל-${shorter} ימים.`,
        metaPatch: {
          target_days: shorter,
          adjusted_by: 'almog',
          adjusted_at: new Date().toISOString(),
        },
      };
    }
  }

  /** אם 4 מתוך 7 הימים האחרונים נשברו → להאריך כדי לתת זמן לבנות מחדש. */
  if (!snapshot.achieved && missedIn7 >= 4 && snapshot.targetDays < 60) {
    const longer = Math.min(60, snapshot.targetDays + 3);
    return {
      kind: 'extend',
      newTargetDays: longer,
      reason: `קצת קשה השבוע — אלמוג מאריך את היעד ב-3 ימים כדי לתת זמן.`,
      metaPatch: {
        target_days: longer,
        adjusted_by: 'almog',
        adjusted_at: new Date().toISOString(),
      },
    };
  }

  return {
    kind: 'none',
    newTargetDays: snapshot.targetDays,
    reason: 'no_change',
    metaPatch: {},
  };
}

/** ממזג HabitMetaEntry קיים עם patch (immutable). */
export function applyHabitMetaPatch(
  existingMeta: unknown,
  habitId: string,
  patch: Partial<HabitMetaEntry>
): Record<string, HabitMetaEntry> {
  const base = (existingMeta && typeof existingMeta === 'object' && !Array.isArray(existingMeta)
    ? (existingMeta as Record<string, unknown>)
    : {}) as Record<string, unknown>;
  const prev = parseMeta(existingMeta, habitId);
  const next: HabitMetaEntry = { ...prev, ...patch };
  const out: Record<string, HabitMetaEntry> = {};
  for (const k of Object.keys(base)) {
    if (k === habitId) continue;
    const v = base[k];
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = parseMeta({ [k]: v }, k);
    }
  }
  out[habitId] = next;
  return out;
}
