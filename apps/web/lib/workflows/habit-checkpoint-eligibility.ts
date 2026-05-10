import type { HabitCheckpointSlot } from './almog-habit-checkpoint-payload';

export type ParsedJourneyHabit = {
  id: string;
  title: string;
  frequency: 'daily' | 'weekly' | 'per_meal';
  /** רלוונטי ל־weekly — 0=ראשון … 6=שבת */
  weekly_day: number;
};

/** תאריך YYYY-MM-DD בלוח ירושלים + יום בשבוע (0=ראשון … 6=שבת) */
export function jerusalemCalendarParts(date: Date): {
  dateKey: string;
  weekday: number;
} {
  const dateKey = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);

  const wdShort = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jerusalem',
    weekday: 'short',
  }).format(date);

  const wdMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const weekday = wdMap[wdShort] ?? 0;
  return { dateKey, weekday };
}

export function parseJourneyHabitsJson(raw: unknown): ParsedJourneyHabit[] {
  if (!Array.isArray(raw)) return [];
  const out: ParsedJourneyHabit[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const id = typeof row.id === 'string' ? row.id : '';
    const title = typeof row.title === 'string' ? row.title : '';
    if (!id || !title) continue;
    const fr = row.frequency;
    const frequency: ParsedJourneyHabit['frequency'] =
      fr === 'weekly' || fr === 'per_meal' ? fr : 'daily';
    let weekly_day = 0;
    if (typeof row.weekly_day === 'number' && row.weekly_day >= 0 && row.weekly_day <= 6) {
      weekly_day = row.weekly_day;
    }
    out.push({ id, title, frequency, weekly_day });
  }
  return out;
}

/**
 * האם הרגל דורש בדיקה בחלון הזמן הזה (לפי תדירות מוגדרת בצעד).
 * - per_meal: בוקר / צהריים / ערב
 * - daily: רק בוקר (הודעה אחת ליום)
 * - weekly: רק ביום weekly_day ובוקר בלבד (הודעה אחת לשבוע לכל הרגל)
 */
export function habitMatchesCheckpointSlot(
  habit: ParsedJourneyHabit,
  slot: HabitCheckpointSlot,
  jerusalemWeekday: number
): boolean {
  if (habit.frequency === 'per_meal') {
    return true;
  }
  if (habit.frequency === 'daily') {
    return slot === 'morning';
  }
  const targetDay = habit.weekly_day;
  if (jerusalemWeekday !== targetDay) return false;
  return slot === 'morning';
}

export function filterHabitsForSlot(
  habits: ParsedJourneyHabit[],
  slot: HabitCheckpointSlot,
  jerusalemWeekday: number
): ParsedJourneyHabit[] {
  return habits.filter((h) => habitMatchesCheckpointSlot(h, slot, jerusalemWeekday));
}
