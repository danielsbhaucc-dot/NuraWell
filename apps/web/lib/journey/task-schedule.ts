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
} from '../types/journey';

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
  if (value === 'daily' || value === 'multi_daily' || value === 'weekly' || value === 'per_meal') {
    return value;
  }
  return 'one_time';
}

/** מאחד את ה-schedule עבור JourneyTask, כולל פולבק וברירות מחדל ל-times_per_day/weekly_day. */
export function resolveTaskSchedule(task: Pick<JourneyTask, 'schedule' | 'times_per_day' | 'weekly_day'>): {
  schedule: JourneyTaskSchedule;
  times_per_day: number;
  weekly_day: number;
} {
  const schedule = normalizeTaskSchedule(task.schedule);
  let tpd =
    typeof task.times_per_day === 'number' && task.times_per_day >= 1 && task.times_per_day <= 6
      ? Math.floor(task.times_per_day)
      : schedule === 'multi_daily'
        ? 3
        : schedule === 'per_meal'
          ? 3
          : 1;
  if (schedule === 'one_time' || schedule === 'daily' || schedule === 'weekly') tpd = 1;
  const wd =
    typeof task.weekly_day === 'number' && task.weekly_day >= 0 && task.weekly_day <= 6
      ? task.weekly_day
      : 0;
  return { schedule, times_per_day: tpd, weekly_day: wd };
}

/* ============================================================
 *  Slot helpers
 * ============================================================ */

/** הסלוט "ברירת מחדל" לפי schedule + times_per_day. */
export function slotsForSchedule(
  schedule: JourneyTaskSchedule,
  timesPerDay: number
): JourneyTaskSlot[] {
  if (schedule === 'one_time') return ['full_day'];
  if (schedule === 'daily' || schedule === 'weekly') return ['full_day'];
  if (schedule === 'per_meal') {
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

/** Label עברי קצר לתצוגה (UI / AI). */
export function slotLabel(slot: JourneyTaskSlot): string {
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
      return 'ארוחת בוקר';
    case 'meal_lunch':
      return 'ארוחת צהריים';
    case 'meal_dinner':
      return 'ארוחת ערב';
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
    case 'noon':
    case 'meal_lunch':
      return '🌞';
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

/** האם משימה חוזרת היום (כלומר, יש מה לסמן היום)? */
export function isTaskActiveToday(
  task: Pick<JourneyTask, 'schedule' | 'times_per_day' | 'weekly_day'>,
  date: Date = new Date()
): boolean {
  const { schedule, weekly_day } = resolveTaskSchedule(task);
  if (schedule === 'one_time') return false;
  if (schedule === 'weekly') return jerusalemWeekday(date) === weekly_day;
  return true;
}

/** Label עברי לתזמון — לתצוגות אדמין/משתמש/AI. */
export function scheduleLabel(
  schedule: JourneyTaskSchedule,
  timesPerDay: number,
  weeklyDay: number
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
    case 'per_meal':
      return timesPerDay >= 3 ? 'לפני כל ארוחה' : `לפני ${timesPerDay} ארוחות`;
  }
}
