/**
 * 🔥 חישוב סטריק (רצף ימים) למשימה ספציפית — *לפני* קריאת ה-AI.
 *
 * הרציונל: ה-AI צריך לראות "4 ימים רצוף" כעובדה מספרית, לא להמציא אותה
 * מהקשר. החישוב כאן דטרמיניסטי 100% על בסיס `journey_task_executions`,
 * ולכן ה-AI יכול לפרגן במדויק ("רצף של 4 ימים, אלוף!").
 *
 * עקרונות:
 *   1. סופרים רק `outcome='completed'` (attempt_failed לא נחשב).
 *   2. יום שכל הסלוטים הנדרשים שלו הושלמו → "יום פעיל".
 *   3. היום הנוכחי לא שובר רצף גם אם לא הושלם — כי אולי המשתמש עוד יסיים.
 *   4. רצף = ימים פעילים רצופים *מהיום אחורנית*; שובר ברגע שיש יום ללא ביצוע.
 *   5. מבוסס על schedule + times_per_day של המשימה (מספר סלוטים נדרשים ביום).
 */
import type { SupabaseClient } from '@supabase/supabase-js';

import type { JourneyTaskSchedule, JourneyTaskSlot } from '../types/journey';
import {
  jerusalemDateKey,
  slotsForSchedule,
} from './task-schedule';

export type TaskStreakSummary = {
  /** רצף ימים פעילים רצוף עד היום (יום ללא ביצוע שובר). */
  currentStreak: number;
  /** רצף הטוב ביותר שאי-פעם היה למשתמש על המשימה. */
  bestStreak: number;
  /** האם היום נחשב פעיל כבר (כל הסלוטים הנדרשים הושלמו). */
  todayActive: boolean;
  /** סלוטים שהשתלמו היום (set). */
  todayDoneSlots: ReadonlySet<JourneyTaskSlot>;
  /** סלוטים שעוד פתוחים היום. */
  todayPendingSlots: readonly JourneyTaskSlot[];
  /** סך הסלוטים הנדרשים ליום אחד של המשימה. */
  slotsPerDay: number;
  /** סך הימים שבהם המשימה הושלמה אי-פעם (אחרי קבלתה). */
  totalCompletedDays: number;
};

type ExecutionRow = {
  date_key: string;
  slot: JourneyTaskSlot;
  outcome?: string | null;
};

/**
 * עוטף את ה-DB עם fallback בטוח: אם `outcome` עדיין לא קיים ב-DB
 * (מיגרציה 000030 לא רצה), הסלקט יעדכן וכל השורות יחשבו "completed".
 */
async function fetchExecutionsForStreak(
  supabase: SupabaseClient,
  userId: string,
  stepId: string,
  taskId: string,
  sinceKey: string
): Promise<ExecutionRow[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let { data, error } = await supabase
    .from('journey_task_executions')
    .select('date_key, slot, outcome')
    .eq('user_id', userId)
    .eq('step_id', stepId)
    .eq('task_id', taskId)
    .gte('date_key', sinceKey)
    .order('date_key', { ascending: false })
    .limit(500);

  /** fallback: אם העמודה outcome עדיין לא קיימת ב-DB → סלקט בלי outcome. */
  if (error && (error.code === '42703' || /outcome/i.test(error.message ?? ''))) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const retry = await supabase
      .from('journey_task_executions')
      .select('date_key, slot')
      .eq('user_id', userId)
      .eq('step_id', stepId)
      .eq('task_id', taskId)
      .gte('date_key', sinceKey)
      .order('date_key', { ascending: false })
      .limit(500);
    data = retry.data?.map((row) => ({ ...row, outcome: null })) ?? null;
    error = retry.error;
  }

  if (error || !Array.isArray(data)) return [];
  return data as ExecutionRow[];
}

function dateKeyDaysAgo(days: number, now = new Date()): string {
  return jerusalemDateKey(new Date(now.getTime() - days * 24 * 60 * 60 * 1000));
}

/**
 * סופר רצף ימים פעילים אחורנית מהיום, על בסיס Map<date_key, Set<slot>>.
 * היום הנוכחי לא שובר רצף גם אם לא פעיל (אופציה לסיים בהמשך).
 */
function countStreakBackwards(
  slotsByDay: Map<string, Set<JourneyTaskSlot>>,
  requiredSlotsPerDay: number,
  todayKey: string,
  lookbackDays = 90
): { current: number; best: number; totalDays: number } {
  let current = 0;
  let best = 0;
  let running = 0;
  let totalDays = 0;
  let streakStillRunning = true;

  /**
   * עוברים מהיום אחורנית. סופרים `current` עד שנשבר; ממשיכים לעבור כדי
   * לחשב `best` ו-`totalDays`.
   */
  for (let i = 0; i < lookbackDays; i++) {
    const k = dateKeyDaysAgo(i);
    const done = (slotsByDay.get(k)?.size ?? 0) >= requiredSlotsPerDay && requiredSlotsPerDay > 0;
    if (done) {
      running += 1;
      totalDays += 1;
      if (running > best) best = running;
      if (streakStillRunning) current = running;
    } else {
      if (k === todayKey) {
        /** היום פתוח — לא שובר רצף, אבל לא מוסיף לו עד שיסומן. */
        continue;
      }
      streakStillRunning = false;
      running = 0;
    }
  }

  return { current, best, totalDays };
}

export type ComputeTaskStreakOptions = {
  /** משתמש */
  userId: string;
  /** צעד שאליו שייכת המשימה */
  stepId: string;
  /** מזהה המשימה (TEXT, לא UUID — כפי שמופיע ב-journey_task_executions) */
  taskId: string;
  /** schedule + times_per_day של המשימה (לחישוב כמה סלוטים נדרשים ליום) */
  schedule: JourneyTaskSchedule;
  timesPerDay: number;
  /** weekly_day — אם המשימה שבועית, היום בלבד נחשב פעיל. */
  weeklyDay?: number | null;
  /** טווח עיון אחורה (ברירת מחדל 90 יום) */
  lookbackDays?: number;
  now?: Date;
};

/**
 * חישוב סטריק (deterministic) — לקריאה לפני `sendTaskCompletionCelebration`.
 *
 * אם המשימה היא `one_time`, הסטריק תמיד 1 / 0 (אין מושג רצף).
 * אם היא `weekly`, רצף נמדד בימים-של-שבועיים (מותאם — לעבור על המשימה
 * רק ביום השבוע הנכון; כל אחר נחשב off ולא שובר).
 */
export async function computeTaskStreak(
  supabase: SupabaseClient,
  opts: ComputeTaskStreakOptions
): Promise<TaskStreakSummary> {
  const now = opts.now ?? new Date();
  const todayKey = jerusalemDateKey(now);
  const lookback = opts.lookbackDays ?? 90;
  const sinceKey = dateKeyDaysAgo(lookback - 1, now);

  const slotsRequired = slotsForSchedule(opts.schedule, opts.timesPerDay);
  const slotsPerDay = slotsRequired.length;

  if (opts.schedule === 'one_time') {
    return {
      currentStreak: 0,
      bestStreak: 0,
      todayActive: false,
      todayDoneSlots: new Set<JourneyTaskSlot>(),
      todayPendingSlots: [],
      slotsPerDay: 1,
      totalCompletedDays: 0,
    };
  }

  const rows = await fetchExecutionsForStreak(
    supabase,
    opts.userId,
    opts.stepId,
    opts.taskId,
    sinceKey
  );

  /** מסננים רק `completed` (אם השדה קיים). */
  const completedRows = rows.filter(
    (r) => !r.outcome || r.outcome === 'completed'
  );

  /** groupBy date_key → Set<slot> */
  const slotsByDay = new Map<string, Set<JourneyTaskSlot>>();
  for (const r of completedRows) {
    const set = slotsByDay.get(r.date_key) ?? new Set<JourneyTaskSlot>();
    set.add(r.slot);
    slotsByDay.set(r.date_key, set);
  }

  const todayDoneSlots = slotsByDay.get(todayKey) ?? new Set<JourneyTaskSlot>();
  const todayPendingSlots = slotsRequired.filter((s) => !todayDoneSlots.has(s));
  const todayActive = todayDoneSlots.size >= slotsPerDay && slotsPerDay > 0;

  const { current, best, totalDays } = countStreakBackwards(
    slotsByDay,
    slotsPerDay,
    todayKey,
    lookback
  );

  return {
    currentStreak: current,
    bestStreak: best,
    todayActive,
    todayDoneSlots,
    todayPendingSlots,
    slotsPerDay,
    totalCompletedDays: totalDays,
  };
}

/**
 * הופך סטריק לטקסט עברי קצר לפי הקשר רגשי. עוזר לפרסונליזציה ב-prompt.
 */
export function streakLabelHe(summary: TaskStreakSummary): string {
  if (summary.currentStreak >= 14) return `${summary.currentStreak} ימים רצוף — אגדה`;
  if (summary.currentStreak >= 7) return `${summary.currentStreak} ימים רצוף — שבוע!`;
  if (summary.currentStreak >= 4) return `${summary.currentStreak} ימים רצוף — אש`;
  if (summary.currentStreak >= 2) return `${summary.currentStreak} ימים רצוף`;
  if (summary.currentStreak === 1) return `יום ראשון`;
  return `התחלה חדשה`;
}
