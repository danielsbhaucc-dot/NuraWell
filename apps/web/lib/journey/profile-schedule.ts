/**
 * profile-schedule.ts — זמני יום נגזרים מפרופיל המשתמש (השכמה, ארוחות, שינה).
 * תזמוני משימות גמישים מוגדרים על ידי המנהל ומסונכרנים עם הפרופיל.
 */

import { parseHHMMToMinutes } from '../ai/almog-time-context';
import { buildMealSchedule } from '../onboarding/meal-schedule';
import type { JourneyTaskSchedule, JourneyTaskSlot, MealTiming } from '../types/journey';
import { slotsForSchedule } from './task-schedule';

export type UserScheduleProfile = {
  wake_up_time?: string | null;
  sleep_time?: string | null;
  meal_count?: number | null;
  meal_schedule?: Array<{ time?: string | null; label?: string | null; slot?: string }> | null;
};

const MEAL_SLOT_ORDER: JourneyTaskSlot[] = [
  'meal_breakfast',
  'meal_snack_morning',
  'meal_lunch',
  'meal_snack_evening',
  'meal_dinner',
];

function hhmm(raw: string | null | undefined): number | null {
  if (!raw?.trim()) return null;
  return parseHHMMToMinutes(String(raw).slice(0, 5));
}

function defaultSlotMinutes(slot: JourneyTaskSlot): number {
  switch (slot) {
    case 'morning':
    case 'meal_breakfast':
    case 'meal_snack_morning':
      return 8 * 60;
    case 'noon':
    case 'meal_lunch':
      return 13 * 60;
    case 'meal_snack_evening':
      return 16 * 60;
    case 'evening':
    case 'meal_dinner':
      return 19 * 60;
    case 'full_day':
      return 10 * 60;
    default: {
      const m = /^slot_(\d+)$/.exec(slot);
      if (m) {
        const n = Number(m[1]);
        const dayStart = 6 * 60;
        const dayEnd = 22 * 60;
        const span = (dayEnd - dayStart) / 6;
        return dayStart + (n - 1) * span;
      }
      return 12 * 60;
    }
  }
}

/** ברירת מחדל לפי סוג טיימינג ארוחה — אם המנהל לא הגדיר offset ספציפי */
export function mealTimingOffset(mealTiming: MealTiming, customMinutes?: number | null): number {
  if (typeof customMinutes === 'number' && Number.isFinite(customMinutes)) {
    return Math.round(customMinutes);
  }
  if (mealTiming === 'before') return -20;
  if (mealTiming === 'during') return 0;
  return 30;
}

/**
 * מחזיר דקה ביום (0–1439) שבה הסלוט אמור להתרחש — לפי פרופיל המשתמש.
 * `mealOffsetMinutes` — הגדרת מנהל למשימת per_meal (דקות לפני/אחרי/בזמן).
 */
export function resolveSlotTargetMinutes(
  slot: JourneyTaskSlot,
  schedule: JourneyTaskSchedule,
  timesPerDay: number,
  mealTiming: MealTiming,
  profile: UserScheduleProfile,
  mealOffsetMinutes?: number | null
): number {
  const wake = hhmm(profile.wake_up_time);
  const sleep = hhmm(profile.sleep_time);
  const meals = Array.isArray(profile.meal_schedule) ? profile.meal_schedule : [];
  const offset = mealTimingOffset(mealTiming, mealOffsetMinutes);

  if (schedule === 'per_meal') {
    const taskSlots = slotsForSchedule('per_meal', timesPerDay);
    const idx = taskSlots.indexOf(slot);
    if (idx >= 0 && meals[idx]?.time) {
      const t = hhmm(meals[idx].time);
      if (t != null) return t + offset;
    }
    const fallbackIdx = MEAL_SLOT_ORDER.indexOf(slot);
    if (fallbackIdx >= 0 && meals[fallbackIdx]?.time) {
      const t = hhmm(meals[fallbackIdx].time);
      if (t != null) return t + offset;
    }
    return defaultSlotMinutes(slot) + offset;
  }

  if (schedule === 'multi_daily') {
    const taskSlots = slotsForSchedule('multi_daily', timesPerDay);
    const idx = taskSlots.indexOf(slot);
    if (idx === 0 && wake != null) return wake + 30;
    if (idx === taskSlots.length - 1 && sleep != null) {
      return Math.max((wake ?? 6 * 60) + 60, sleep - 45);
    }
    if (idx === 1 && taskSlots.length >= 3) {
      const lunch =
        meals.find((m) => /צהריים|צהר|lunch|noon/i.test(m.label ?? '')) ??
        meals[Math.floor(meals.length / 2)];
      if (lunch?.time) {
        const t = hhmm(lunch.time);
        if (t != null) return t;
      }
    }
  }

  if (slot === 'full_day' && wake != null) return wake + 60;
  if (slot === 'morning' && wake != null) return wake + 30;
  if (slot === 'noon' && meals.length > 0) {
    const lunch = meals[Math.floor(meals.length / 2)];
    const t = hhmm(lunch?.time ?? null);
    if (t != null) return t;
  }
  if (slot === 'evening' && sleep != null) return Math.max((wake ?? 6 * 60) + 60, sleep - 45);

  return defaultSlotMinutes(slot);
}

export function mealTimesFromStrings(times: string[]): Array<{ time: string; label: string; slot: string }> {
  return buildMealSchedule(times);
}
