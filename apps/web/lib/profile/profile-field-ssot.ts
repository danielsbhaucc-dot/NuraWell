/**
 * מקור אמת אחד לשדות פרופיל שמוצגים במסכים שונים.
 * משקל / שינה / מגדר — תמיד מאותם שדות + מילונים.
 */

import type { OnboardingGender } from '../onboarding/types';

/** תווית מגדר אחידה בכל הממשק (כותרת, פרטים, עריכה). */
export function genderDisplayLabel(gender: OnboardingGender | null | undefined): string {
  if (gender === 'male') return 'גבר';
  if (gender === 'female') return 'אישה';
  return '';
}

export type RhythmTimes = {
  wake_up_time: string | null;
  sleep_time: string | null;
};

/** תצוגת שינה — בלי ברירות מחדל מזויפות כשאין נתון ב-DB. */
export function formatSleepDisplay(rhythm: RhythmTimes): string {
  const wake = rhythm.wake_up_time?.trim() || null;
  const sleep = rhythm.sleep_time?.trim() || null;
  return `${wake ?? '—'} · ${sleep ?? '—'}`;
}

/**
 * משקל לתצוגה: קודם profiles.current_weight_kg, אחרת מדידה אחרונה מ-user_measurements.
 */
export function resolveDisplayWeightKg(
  profileWeightKg: number | null | undefined,
  latestMeasurementKg: number | null | undefined
): number | null {
  if (typeof profileWeightKg === 'number' && Number.isFinite(profileWeightKg)) {
    return profileWeightKg;
  }
  if (typeof latestMeasurementKg === 'number' && Number.isFinite(latestMeasurementKg)) {
    return latestMeasurementKg;
  }
  return null;
}

/** ברירות מחדל לטופס עריכה בלבד — לא לתצוגת קריאה. */
export const RHYTHM_EDIT_DEFAULTS = {
  wake_up_time: '07:00',
  sleep_time: '22:30',
} as const;
