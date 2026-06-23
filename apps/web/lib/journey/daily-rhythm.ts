/**
 * daily-rhythm.ts — זמני יום מותאמים אישית מהפרופיל.
 * משמש לבחירת משימה חכמה, התראות ותצוגת לוח זמנים.
 */

import { parseHHMMToMinutes } from '../ai/almog-time-context';
import { buildMealSchedule } from '../onboarding/meal-schedule';
import type { JourneyTaskSchedule, JourneyTaskSlot, MealTiming } from '../types/journey';
import { slotsForSchedule } from './task-schedule';

export type DailyRhythm = {
  /** זמן סלוט בוקר (multi_daily) */
  morning?: string | null;
  /** זמן סלוט צהריים */
  noon?: string | null;
  /** זמן סלוט ערב */
  evening?: string | null;
  /** סלוטים מותאמים — למשל { "slot_1": "10:30", "slot_2": "15:00" } */
  custom_slots?: Record<string, string> | null;
};

export type UserScheduleProfile = {
  wake_up_time?: string | null;
  sleep_time?: string | null;
  meal_count?: number | null;
  meal_schedule?: Array<{ time?: string | null; label?: string | null; slot?: string }> | null;
  daily_rhythm?: DailyRhythm | null;
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

/** מפרסר ערך JSONB / אובייקט גולמי ל-DailyRhythm בטוח. */
export function parseDailyRhythm(raw: unknown): DailyRhythm | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const customRaw = row.custom_slots;
  let custom_slots: Record<string, string> | null = null;
  if (customRaw && typeof customRaw === 'object' && !Array.isArray(customRaw)) {
    custom_slots = {};
    for (const [k, v] of Object.entries(customRaw as Record<string, unknown>)) {
      if (typeof v === 'string' && /^\d{1,2}:\d{2}$/.test(v.trim())) {
        custom_slots[k] = v.trim();
      }
    }
    if (!Object.keys(custom_slots).length) custom_slots = null;
  }
  const pickTime = (key: string) => {
    const v = row[key];
    return typeof v === 'string' && /^\d{1,2}:\d{2}$/.test(v.trim()) ? v.trim() : null;
  };
  const rhythm: DailyRhythm = {
    morning: pickTime('morning'),
    noon: pickTime('noon'),
    evening: pickTime('evening'),
    custom_slots,
  };
  if (!rhythm.morning && !rhythm.noon && !rhythm.evening && !rhythm.custom_slots) return null;
  return rhythm;
}

/** ברירות מחדל לסלוטי יום — נגזרות מהשכמה, ארוחות ושינה. */
export function buildDefaultDailyRhythm(profile: UserScheduleProfile): DailyRhythm {
  const wake = hhmm(profile.wake_up_time) ?? 7 * 60;
  const sleep = hhmm(profile.sleep_time) ?? 22 * 60;
  const meals = Array.isArray(profile.meal_schedule) ? profile.meal_schedule : [];
  const lunch =
    meals.find((m) => /צהריים|צהר|lunch|noon/i.test(m.label ?? '')) ??
    meals[Math.floor(meals.length / 2)];
  const lunchMin = hhmm(lunch?.time ?? null) ?? 13 * 60;
  const eveningMeal = meals[meals.length - 1];
  const eveningMin = hhmm(eveningMeal?.time ?? null) ?? Math.max(wake + 12 * 60, sleep - 90);

  const fmt = (mins: number) => {
    const h = Math.floor(mins / 60) % 24;
    const m = mins % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };

  return {
    morning: fmt(wake + 30),
    noon: fmt(lunchMin),
    evening: fmt(eveningMin),
    custom_slots: null,
  };
}

/** ממזג הגדרות משתמש עם ברירות מחדל. */
export function resolveDailyRhythm(profile: UserScheduleProfile): DailyRhythm {
  const defaults = buildDefaultDailyRhythm(profile);
  const saved = parseDailyRhythm(profile.daily_rhythm);
  if (!saved) return defaults;
  return {
    morning: saved.morning ?? defaults.morning,
    noon: saved.noon ?? defaults.noon,
    evening: saved.evening ?? defaults.evening,
    custom_slots: saved.custom_slots ?? defaults.custom_slots,
  };
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

export function mealTimingOffset(mealTiming: MealTiming): number {
  if (mealTiming === 'before') return -20;
  if (mealTiming === 'during') return 0;
  return 30;
}

/**
 * מחזיר דקה ביום (0–1439) שבה הסלוט "אמור" להתרחש — לפי daily_rhythm ופרופיל.
 */
export function resolveSlotTargetMinutes(
  slot: JourneyTaskSlot,
  schedule: JourneyTaskSchedule,
  timesPerDay: number,
  mealTiming: MealTiming,
  profile: UserScheduleProfile
): number {
  const rhythm = resolveDailyRhythm(profile);
  const wake = hhmm(profile.wake_up_time);
  const sleep = hhmm(profile.sleep_time);
  const meals = Array.isArray(profile.meal_schedule) ? profile.meal_schedule : [];

  const custom = rhythm.custom_slots?.[slot];
  if (custom) {
    const t = hhmm(custom);
    if (t != null) return t;
  }

  if (slot === 'morning' && rhythm.morning) {
    const t = hhmm(rhythm.morning);
    if (t != null) return t;
  }
  if (slot === 'noon' && rhythm.noon) {
    const t = hhmm(rhythm.noon);
    if (t != null) return t;
  }
  if (slot === 'evening' && rhythm.evening) {
    const t = hhmm(rhythm.evening);
    if (t != null) return t;
  }

  if (schedule === 'per_meal') {
    const taskSlots = slotsForSchedule('per_meal', timesPerDay);
    const idx = taskSlots.indexOf(slot);
    if (idx >= 0 && meals[idx]?.time) {
      const t = hhmm(meals[idx].time);
      if (t != null) return t + mealTimingOffset(mealTiming);
    }
    const fallbackIdx = MEAL_SLOT_ORDER.indexOf(slot);
    if (fallbackIdx >= 0 && meals[fallbackIdx]?.time) {
      const t = hhmm(meals[fallbackIdx].time);
      if (t != null) return t + mealTimingOffset(mealTiming);
    }
    return defaultSlotMinutes(slot) + mealTimingOffset(mealTiming);
  }

  if (schedule === 'multi_daily') {
    const taskSlots = slotsForSchedule('multi_daily', timesPerDay);
    const idx = taskSlots.indexOf(slot);
    if (idx === 0 && wake != null) return wake + 30;
    if (idx === taskSlots.length - 1 && sleep != null) {
      return Math.max((wake ?? 6 * 60) + 60, sleep - 45);
    }
  }

  if (slot === 'full_day' && wake != null) return wake + 60;
  if (slot === 'morning' && wake != null) return wake + 30;
  if (slot === 'evening' && sleep != null) return Math.max((wake ?? 6 * 60) + 60, sleep - 45);

  return defaultSlotMinutes(slot);
}

/** בונה meal_schedule ממערך שעות HH:MM (כמו בהרשמה). */
export function mealTimesFromStrings(times: string[]): Array<{ time: string; label: string }> {
  return buildMealSchedule(times).map((m) => ({ time: m.time, label: m.label }));
}
