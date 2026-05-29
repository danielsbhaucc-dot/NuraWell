/**
 * Rule engine טהור (ללא DB / IO) — ממפה (timeOfDay, consecutiveMissedDays)
 * → NotificationState | null.
 *
 * הכלל: ה-engine קורא ל-`deriveNotificationState` **רק** אחרי שכבר ידוע
 * שהמשתמש לא השלים את המשימה היום (Supabase כמקור-אמת — ראה
 * `getUsersForNotification`). לכן `null` כאן = "אל תשלח עכשיו".
 *
 * המצבים (מפרט המוצר):
 *   • 0 ימים רצופים נכשלו (זהו היום הראשון של החמצה):
 *       morning → MORNING_KICKOFF
 *       noon    → NOON_CHECK
 *       evening → EVENING_CHECK
 *   • יום אחד רצוף נכשל (יום 2):
 *       → DAY_2_MISSED בכל slot (3 התראות)
 *   • שני ימים רצופים נכשלו (יום 3):
 *       → DAY_3_MISSED, אבל רק slot אחד ביום (morning).
 *         שאר ה-slots → null.
 *   • 3+ ימים רצופים נכשלו (זה היום ה-4+ שלא בוצע):
 *       → DORMANT, שבועי בלבד (יום ראשון בבוקר ישראל).
 *         שאר השעות → null.
 */

import { israelDateKey } from '../../ai/onboarding-check-in-time';
import type { NotificationState, TimeOfDay } from '../../types/notification-state';

const IL_TZ = 'Asia/Jerusalem';

/** 0=Sunday … 6=Saturday לפי לוח ירושלים. */
export function israelDayOfWeek(now: Date = new Date()): number {
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: IL_TZ,
    weekday: 'short',
  }).format(now);
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[weekday] ?? 0;
}

export interface DeriveStateInput {
  timeOfDay: TimeOfDay;
  /** מספר ימים *לפני היום* שהמשתמש החמיץ ברצף. 0 = אתמול בוצעה / זה היום הראשון. */
  consecutiveMissedDays: number;
  /** Override ל-now() לטסטים. */
  now?: Date;
}

export function deriveNotificationState({
  timeOfDay,
  consecutiveMissedDays,
  now = new Date(),
}: DeriveStateInput): NotificationState | null {
  if (consecutiveMissedDays < 0) return null;

  // 0 missed prior days → first miss
  if (consecutiveMissedDays === 0) {
    if (timeOfDay === 'morning') return 'MORNING_KICKOFF';
    if (timeOfDay === 'noon') return 'NOON_CHECK';
    if (timeOfDay === 'evening') return 'EVENING_CHECK';
    return null;
  }

  // 1 missed prior day → Day 2 of the streak — full daily cadence
  if (consecutiveMissedDays === 1) {
    return 'DAY_2_MISSED';
  }

  // 2 missed prior days → Day 3 of the streak — only morning
  if (consecutiveMissedDays === 2) {
    if (timeOfDay === 'morning') return 'DAY_3_MISSED';
    return null;
  }

  // 3+ missed prior days → DORMANT — שבועי בלבד, יום ראשון בבוקר ישראל
  if (consecutiveMissedDays >= 3) {
    if (timeOfDay !== 'morning') return null;
    if (israelDayOfWeek(now) !== 0) return null;
    return 'DORMANT';
  }

  return null;
}

/** Re-export לנוחות (כדי שמשתמשים של ה-engine ייבאו ממקום אחד). */
export { israelDateKey };
