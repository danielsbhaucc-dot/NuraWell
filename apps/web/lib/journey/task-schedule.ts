/**
 * task-schedule.ts
 * ----------------
 * חישובים סביב תזמוני משימות (one_time / daily / multi_daily / weekly / per_meal).
 *
 *  - dateKey של "היום" באזור ירושלים.
 *  - חישוב הסלוטים הצפויים עבור משימה מסוימת (כותרת + תאריך).
 *  - דקירת ה-slot הנכון בהקשר של שעה נוכחית (לדיווחי AI/Notif).
 *  - mapping מ-slot ל-label עברי לתצוגה.
 */

import type {
  JourneyTask,
  JourneyTaskSchedule,
  JourneyTaskSlot,
  MealTarget,
  MealTiming,
} from '../types/journey';

/**
 * "פרופיל ארוחות" של המשתמש — מספר ארוחות עיקריות + תוויות.
 * משמש לחישוב סלוטים כאשר משימה מוגדרת `meal_target='all'`.
 */
export type UserMealProfile = {
  /** מספר הארוחות העיקריות שהמשתמש הגדיר (0..4 לפי DB constraint). */
  meal_count: number | null;
  /** רשימת הארוחות עם זמן ותווית (אופציונלי) */
  meal_schedule?: Array<{ time?: string | null; label?: string | null }> | null;
};

/* ============================================================
 *  Date helpers (Asia/Jerusalem)
 * ============================================================ */

/** YYYY-MM-DD לפי לוח ירושלים */
export function jerusalemDateKey(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** 0=ראשון..6=שבת לפי לוח ירושלים */
export function jerusalemWeekday(date: Date = new Date()): number {
  const wdShort = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jerusalem',
    weekday: 'short',
  }).format(date);
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[wdShort] ?? 0;
}

/** דקה מתחילת היום (0..1439) לפי לוח ירושלים */
export function jerusalemMinutesIntoDay(date: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jerusalem',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const h = Number.parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10) || 0;
  const m = Number.parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0', 10) || 0;
  return h * 60 + m;
}

/* ============================================================
 *  Schedule normalization
 * ============================================================ */

/** מחזיר schedule בטוח לערך גולמי (ברירת מחדל: one_time). */
export function normalizeTaskSchedule(value: unknown): JourneyTaskSchedule {
  if (
    value === 'daily' ||
    value === 'multi_daily' ||
    value === 'weekly' ||
    value === 'monthly' ||
    value === 'quarterly' ||
    value === 'semi_annual' ||
    value === 'custom' ||
    value === 'per_meal'
  ) {
    return value;
  }
  return 'one_time';
}

/** ברירת מחדל לטיימינג ארוחה (לפני / בזמן / אחרי). */
export function normalizeMealTiming(value: unknown): MealTiming {
  if (value === 'after') return 'after';
  if (value === 'during') return 'during';
  return 'before';
}

/** ברירת מחדל למטרת ארוחה (fixed / all). */
export function normalizeMealTarget(value: unknown): MealTarget {
  return value === 'all' ? 'all' : 'fixed';
}

/**
 * מאחד את ה-schedule עבור JourneyTask, כולל פולבק וברירות מחדל ל-times_per_day/weekly_day.
 *
 * אם `userProfile` הועבר ו-`task.meal_target === 'all'`, ה-`times_per_day` ייגזר
 * מ-`profile.meal_count` (1..5). חוסר פרופיל → נופלים ל-`times_per_day` שהוגדר ידנית.
 */
export function resolveTaskSchedule(
  task: Pick<
    JourneyTask,
    | 'schedule'
    | 'times_per_day'
    | 'weekly_day'
    | 'monthly_day'
    | 'interval_days'
    | 'meal_timing'
    | 'meal_target'
    | 'meal_offset_minutes'
  >,
  userProfile?: UserMealProfile | null
): {
  schedule: JourneyTaskSchedule;
  times_per_day: number;
  weekly_day: number;
  monthly_day: number;
  interval_days: number;
  meal_timing: MealTiming;
  meal_target: MealTarget;
  meal_offset_minutes: number | null;
} {
  const schedule = normalizeTaskSchedule(task.schedule);
  const mealTiming = normalizeMealTiming(task.meal_timing);
  const mealTarget = normalizeMealTarget(task.meal_target);

  let tpd =
    typeof task.times_per_day === 'number' && task.times_per_day >= 1 && task.times_per_day <= 6
      ? Math.floor(task.times_per_day)
      : schedule === 'multi_daily'
        ? 3
        : schedule === 'per_meal'
          ? 3
          : 1;

  /** per_meal + meal_target='all' → השתמש ב-meal_count מהפרופיל (1..5). */
  if (schedule === 'per_meal' && mealTarget === 'all' && userProfile) {
    const profileCount =
      typeof userProfile.meal_count === 'number' && userProfile.meal_count >= 1
        ? Math.min(5, Math.floor(userProfile.meal_count))
        : Array.isArray(userProfile.meal_schedule)
          ? Math.min(5, userProfile.meal_schedule.length)
          : null;
    if (profileCount && profileCount >= 1) {
      tpd = profileCount;
    }
  }

  if (
    schedule === 'one_time' ||
    schedule === 'daily' ||
    schedule === 'weekly' ||
    schedule === 'monthly' ||
    schedule === 'quarterly' ||
    schedule === 'semi_annual' ||
    schedule === 'custom'
  ) {
    tpd = 1;
  }

  const wd =
    typeof task.weekly_day === 'number' && task.weekly_day >= 0 && task.weekly_day <= 6
      ? task.weekly_day
      : 0;
  const md =
    typeof task.monthly_day === 'number' && task.monthly_day >= 1 && task.monthly_day <= 31
      ? task.monthly_day
      : 1;
  const intervalDays =
    typeof task.interval_days === 'number' &&
    task.interval_days >= 2 &&
    task.interval_days <= 365
      ? Math.floor(task.interval_days)
      : 7;
  const mealOffset =
    typeof task.meal_offset_minutes === 'number' && Number.isFinite(task.meal_offset_minutes)
      ? Math.round(task.meal_offset_minutes)
      : null;
  return {
    schedule,
    times_per_day: tpd,
    weekly_day: wd,
    monthly_day: md,
    interval_days: intervalDays,
    meal_timing: mealTiming,
    meal_target: mealTarget,
    meal_offset_minutes: mealOffset,
  };
}

/* ============================================================
 *  Slot helpers
 * ============================================================ */

/**
 * הסלוט "ברירת מחדל" לפי schedule + times_per_day.
 *
 * עבור per_meal:
 *   - 1   → ארוחת צהריים בלבד (סטנדרט תזונתי)
 *   - 2   → בוקר + ערב
 *   - 3   → בוקר + צהריים + ערב (3 ארוחות עיקריות)
 *   - 4   → בוקר + צהריים + ביניים אחה"צ + ערב
 *   - 5   → בוקר + ביניים בוקר + צהריים + ביניים אחה"צ + ערב
 */
export function slotsForSchedule(
  schedule: JourneyTaskSchedule,
  timesPerDay: number
): JourneyTaskSlot[] {
  if (schedule === 'one_time') return ['full_day'];
  if (
    schedule === 'daily' ||
    schedule === 'weekly' ||
    schedule === 'monthly' ||
    schedule === 'quarterly' ||
    schedule === 'semi_annual' ||
    schedule === 'custom'
  ) {
    return ['full_day'];
  }
  if (schedule === 'per_meal') {
    if (timesPerDay >= 5) {
      return [
        'meal_breakfast',
        'meal_snack_morning',
        'meal_lunch',
        'meal_snack_evening',
        'meal_dinner',
      ];
    }
    if (timesPerDay === 4) {
      return ['meal_breakfast', 'meal_lunch', 'meal_snack_evening', 'meal_dinner'];
    }
    if (timesPerDay >= 3) return ['meal_breakfast', 'meal_lunch', 'meal_dinner'];
    if (timesPerDay === 2) return ['meal_breakfast', 'meal_dinner'];
    return ['meal_lunch'];
  }
  /** multi_daily */
  if (timesPerDay <= 1) return ['full_day'];
  if (timesPerDay === 2) return ['morning', 'evening'];
  if (timesPerDay === 3) return ['morning', 'noon', 'evening'];
  const out: JourneyTaskSlot[] = [];
  for (let i = 1; i <= Math.min(6, timesPerDay); i++) {
    out.push(`slot_${i}` as JourneyTaskSlot);
  }
  return out;
}

/**
 * Label עברי קצר לתצוגה (UI / AI).
 *
 * אופציונלית — מקבל `meal_timing` ('before'/'after') שמוסיף "לפני"/"אחרי"
 * לפני שם הארוחה. בלי הפרמטר, מציג את שם הארוחה בלבד (תאימות לאחור).
 */
export function slotLabel(slot: JourneyTaskSlot, mealTiming?: MealTiming): string {
  const prefix =
    mealTiming === 'after' ? 'אחרי' : mealTiming === 'during' ? 'בזמן' : mealTiming === 'before' ? 'לפני' : '';
  const wrap = (mealLabel: string) => (prefix ? `${prefix} ${mealLabel}` : mealLabel);
  switch (slot) {
    case 'full_day':
      return 'היום';
    case 'morning':
      return 'בוקר';
    case 'noon':
      return 'צהריים';
    case 'evening':
      return 'ערב';
    case 'meal_breakfast':
      return wrap('ארוחת בוקר');
    case 'meal_snack_morning':
      return wrap('ביניים בוקר');
    case 'meal_lunch':
      return wrap('ארוחת צהריים');
    case 'meal_snack_evening':
      return wrap('ביניים אחה"צ');
    case 'meal_dinner':
      return wrap('ארוחת ערב');
    default: {
      const m = /^slot_(\d+)$/.exec(slot);
      if (m) return `סלוט ${m[1]}`;
      return slot;
    }
  }
}

/** אימוג'י קטן לסלוט — מסייע לפרסונליזציה של ה-UI ושל הצ'אט. */
export function slotEmoji(slot: JourneyTaskSlot): string {
  switch (slot) {
    case 'morning':
    case 'meal_breakfast':
      return '🌅';
    case 'meal_snack_morning':
      return '☕';
    case 'noon':
    case 'meal_lunch':
      return '🌞';
    case 'meal_snack_evening':
      return '🍎';
    case 'evening':
    case 'meal_dinner':
      return '🌙';
    case 'full_day':
      return '📅';
    default:
      return '⏱️';
  }
}

/** מה הסלוט "הטבעי" של הרגע הזה ביום, על בסיס שעה בירושלים. */
export function currentSlotForSchedule(
  schedule: JourneyTaskSchedule,
  timesPerDay: number,
  now: Date = new Date()
): JourneyTaskSlot {
  const slots = slotsForSchedule(schedule, timesPerDay);
  if (slots.length <= 1) return slots[0] ?? 'full_day';
  const minutes = jerusalemMinutesIntoDay(now);
  /** חתכים נדיבים: עד 11:00 = בוקר, עד 17:00 = צהריים, אחרת ערב */
  const morningCut = 11 * 60;
  const noonCut = 17 * 60;
  if (schedule === 'per_meal') {
    if (slots.includes('meal_breakfast') && minutes < morningCut) return 'meal_breakfast';
    if (slots.includes('meal_lunch') && minutes < noonCut) return 'meal_lunch';
    return slots.includes('meal_dinner') ? 'meal_dinner' : slots[slots.length - 1];
  }
  if (schedule === 'multi_daily') {
    if (slots.includes('morning') && minutes < morningCut) return 'morning';
    if (slots.includes('noon') && minutes < noonCut) return 'noon';
    if (slots.includes('evening')) return 'evening';
    /** slot_1..slot_n: חלוקה לינארית בין 06:00 ל-22:00 */
    const dayStart = 6 * 60;
    const dayEnd = 22 * 60;
    const span = (dayEnd - dayStart) / slots.length;
    const idx = Math.min(slots.length - 1, Math.max(0, Math.floor((minutes - dayStart) / span)));
    return slots[idx] ?? slots[0];
  }
  return slots[0] ?? 'full_day';
}

/* ============================================================
 *  Status / completion helpers
 * ============================================================ */

export interface TaskExecutionLike {
  task_id: string;
  date_key: string;
  slot: JourneyTaskSlot;
}

/** האם הסלוט הזה כבר סומן ליום הזה? */
export function isSlotCompleted(
  executions: ReadonlyArray<TaskExecutionLike>,
  taskId: string,
  dateKey: string,
  slot: JourneyTaskSlot
): boolean {
  return executions.some(
    (e) => e.task_id === taskId && e.date_key === dateKey && e.slot === slot
  );
}

/** סופר כמה סלוטים בוצעו היום למשימה */
export function countCompletedSlotsToday(
  executions: ReadonlyArray<TaskExecutionLike>,
  taskId: string,
  dateKey: string
): number {
  return executions.filter((e) => e.task_id === taskId && e.date_key === dateKey).length;
}

/** סלוטים שעוד פתוחים היום (לא סומנו) */
export function pendingSlotsForToday(
  task: Pick<JourneyTask, 'schedule' | 'times_per_day' | 'weekly_day'>,
  executions: ReadonlyArray<TaskExecutionLike>,
  taskId: string,
  dateKey: string
): JourneyTaskSlot[] {
  const { schedule, times_per_day } = resolveTaskSchedule(task);
  const slots = slotsForSchedule(schedule, times_per_day);
  return slots.filter((s) => !isSlotCompleted(executions, taskId, dateKey, s));
}

/** יום בחודש (1..31) לפי לוח ירושלים */
export function jerusalemDayOfMonth(date: Date = new Date()): number {
  const d = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jerusalem',
    day: 'numeric',
  }).format(date);
  return Number.parseInt(d, 10) || 1;
}

/** יום אחרון בחודש הנוכחי (ירושלים) */
export function jerusalemLastDayOfMonth(date: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: 'numeric',
  }).formatToParts(date);
  const year = Number.parseInt(parts.find((p) => p.type === 'year')?.value ?? '2026', 10);
  const month = Number.parseInt(parts.find((p) => p.type === 'month')?.value ?? '1', 10);
  return new Date(year, month, 0).getDate();
}

/** האם היום בחודש תואם ליום חודשי שנקבע (31 בפברואר → יום אחרון). */
export function isMonthlyDayActive(monthlyDay: number, date: Date = new Date()): boolean {
  const dom = jerusalemDayOfMonth(date);
  const last = jerusalemLastDayOfMonth(date);
  const target = Math.min(Math.max(1, monthlyDay), 31);
  return dom === Math.min(target, last);
}

/** חודש בלוח ירושלים (1..12) */
export function jerusalemMonth(date: Date = new Date()): number {
  const m = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jerusalem',
    month: 'numeric',
  }).format(date);
  return Number.parseInt(m, 10) || 1;
}

function daysSinceAnchor(date: Date = new Date()): number {
  const key = jerusalemDateKey(date);
  const [y, mo, d] = key.split('-').map((x) => Number.parseInt(x, 10));
  const ms = Date.UTC(y, mo - 1, d);
  return Math.floor((ms - Date.UTC(2020, 0, 1)) / 86_400_000);
}

/** האם משימה חוזרת היום (כלומר, יש מה לסמן היום)? */
export function isTaskActiveToday(
  task: Pick<
    JourneyTask,
    'schedule' | 'times_per_day' | 'weekly_day' | 'monthly_day' | 'interval_days'
  >,
  date: Date = new Date()
): boolean {
  const { schedule, weekly_day, monthly_day, interval_days } = resolveTaskSchedule(task);
  if (schedule === 'one_time') return false;
  if (schedule === 'weekly') return jerusalemWeekday(date) === weekly_day;
  if (schedule === 'monthly') return isMonthlyDayActive(monthly_day, date);
  if (schedule === 'quarterly') {
    const month = jerusalemMonth(date);
    return isMonthlyDayActive(monthly_day, date) && [1, 4, 7, 10].includes(month);
  }
  if (schedule === 'semi_annual') {
    const month = jerusalemMonth(date);
    return isMonthlyDayActive(monthly_day, date) && [1, 7].includes(month);
  }
  if (schedule === 'custom') {
    const days = daysSinceAnchor(date);
    return days % interval_days === 0;
  }
  return true;
}

/**
 * Label עברי לתזמון — לתצוגות אדמין/משתמש/AI.
 *
 * עבור per_meal: אם הוגדר mealTiming='after' → "אחרי ...".
 * אם mealTarget='all' → "כל הארוחות" במקום מספר מדויק.
 */
export function scheduleLabel(
  schedule: JourneyTaskSchedule,
  timesPerDay: number,
  weeklyDay: number,
  mealTiming: MealTiming = 'before',
  mealTarget: MealTarget = 'fixed',
  monthlyDay = 1,
  intervalDays = 7
): string {
  const WEEKDAY = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
  switch (schedule) {
    case 'one_time':
      return 'חד-פעמי';
    case 'daily':
      return 'יומי';
    case 'multi_daily':
      return `${timesPerDay} פעמים ביום`;
    case 'weekly':
      return `שבועי · יום ${WEEKDAY[weeklyDay] ?? '?'}`;
    case 'monthly':
      return `חודשי · יום ${monthlyDay} בחודש`;
    case 'quarterly':
      return `רבעוני · יום ${monthlyDay} (ינואר/אפריל/יולי/אוקטובר)`;
    case 'semi_annual':
      return `חצי שנתי · יום ${monthlyDay} (ינואר/יולי)`;
    case 'custom':
      return `כל ${intervalDays} ימים`;
    case 'per_meal': {
      const prefix =
        mealTiming === 'after' ? 'אחרי' : mealTiming === 'during' ? 'בזמן' : 'לפני';
      if (mealTarget === 'all') return `${prefix} כל הארוחות שלי`;
      if (timesPerDay >= 3) return `${prefix} כל ארוחה`;
      return `${prefix} ${timesPerDay} ארוחות`;
    }
  }
}
