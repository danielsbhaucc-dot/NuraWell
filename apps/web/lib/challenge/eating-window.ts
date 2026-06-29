import { parseHHMMToMinutes } from '@/lib/ai/almog-time-context';
import type { EatingWindowConfig } from './types';

export type MealScheduleInput = Array<{ time?: string | null; label?: string | null }>;

const SLEEP_BUFFER_MINUTES = 120;
const EATING_WINDOW_HOURS = 12;

function hhmmToMinutes(raw: string | null | undefined): number | null {
  if (!raw?.trim()) return null;
  return parseHHMMToMinutes(String(raw).slice(0, 5));
}

function minutesToHhmm(mins: number): string {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function normalizeMinutes(m: number): number {
  return ((m % 1440) + 1440) % 1440;
}

export type EatingWindowResult = {
  config: EatingWindowConfig;
  warnings: string[];
  suggestions: string[];
};

/**
 * חישוב חלון אכילה 12:12 אישי לפי ארוחות, השכמה ושינה.
 */
export function computeEatingWindow(params: {
  wakeUpTime?: string | null;
  sleepTime?: string | null;
  mealSchedule?: MealScheduleInput | null;
}): EatingWindowResult {
  const warnings: string[] = [];
  const suggestions: string[] = [];

  const wakeMin = hhmmToMinutes(params.wakeUpTime) ?? 7 * 60;
  const sleepMin = hhmmToMinutes(params.sleepTime) ?? 23 * 60;

  const mealTimes = (params.mealSchedule ?? [])
    .map((m) => hhmmToMinutes(m.time))
    .filter((t): t is number => t != null)
    .sort((a, b) => a - b);

  let firstMealMin = mealTimes[0] ?? wakeMin + 60;
  let lastMealMin = mealTimes[mealTimes.length - 1] ?? firstMealMin + 12 * 60;

  if (firstMealMin < wakeMin) {
    firstMealMin = wakeMin + 30;
    warnings.push('ארוחת הבוקר הוקדמה לאחר ההשכמה.');
  }

  let lastMealRecommended = lastMealMin;
  const gapBeforeSleep = sleepMin >= lastMealMin
    ? sleepMin - lastMealMin
    : sleepMin + 1440 - lastMealMin;

  if (gapBeforeSleep < SLEEP_BUFFER_MINUTES) {
    lastMealRecommended = normalizeMinutes(sleepMin - SLEEP_BUFFER_MINUTES);
    suggestions.push(
      `מומלץ לאכול את ארוחת הערב עד ${minutesToHhmm(lastMealRecommended)} — לפחות שעתיים לפני השינה.`,
    );
    lastMealMin = lastMealRecommended;
  }

  let windowEndMin = normalizeMinutes(firstMealMin + EATING_WINDOW_HOURS * 60);

  if (lastMealMin > firstMealMin && lastMealMin <= windowEndMin) {
    windowEndMin = normalizeMinutes(lastMealMin + EATING_WINDOW_HOURS * 60);
  }

  const sleepBufferEnd = normalizeMinutes(sleepMin - 30);
  if (windowEndMin > sleepBufferEnd && sleepMin > firstMealMin) {
    windowEndMin = Math.min(windowEndMin, sleepBufferEnd);
    suggestions.push('חלון האכילה הותאם כדי שלא יגיע קרוב מדי לשעת השינה.');
  }

  return {
    config: {
      start: minutesToHhmm(firstMealMin),
      end: minutesToHhmm(windowEndMin),
      last_meal_recommended: minutesToHhmm(lastMealRecommended),
      sleep_buffer_minutes: SLEEP_BUFFER_MINUTES,
      first_meal: minutesToHhmm(firstMealMin),
      last_meal: minutesToHhmm(lastMealMin),
    },
    warnings,
    suggestions,
  };
}
