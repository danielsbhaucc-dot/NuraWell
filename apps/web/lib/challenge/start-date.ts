import { jerusalemDateKey, jerusalemMinutesIntoDay, jerusalemWeekday } from '@/lib/journey/task-schedule';

const SUNDAY_CUTOFF_HOUR = 15;

/** שעה בירושלים (0–23) */
export function jerusalemHour(date: Date = new Date()): number {
  return Math.floor(jerusalemMinutesIntoDay(date) / 60);
}

export function jerusalemDateKeyFromDate(date: Date): string {
  return jerusalemDateKey(date);
}

function parseDateKey(key: string): { y: number; m: number; d: number } {
  const [y, m, d] = key.split('-').map((p) => Number.parseInt(p, 10));
  return { y: y || 2026, m: m || 1, d: d || 1 };
}

function addDaysToKey(key: string, days: number): string {
  const { y, m, d } = parseDateKey(key);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/** מחר בלוח ירושלים — לדמו "חוויה מלאה" עם ספירה קצרה */
export function jerusalemTomorrowDateKey(now: Date = new Date()): string {
  return addDaysToKey(jerusalemDateKeyFromDate(now), 1);
}

/**
 * האתגר תמיד מתחיל ביום ראשון:
 * - נרשם בראשון לפני 15:00 → אותו ראשון
 * - אחרת → ראשון הבא
 */
export function computeChallengeStartDate(registeredAt: Date = new Date()): string {
  const wd = jerusalemWeekday(registeredAt);
  const hour = jerusalemHour(registeredAt);
  const todayKey = jerusalemDateKeyFromDate(registeredAt);

  if (wd === 0 && hour < SUNDAY_CUTOFF_HOUR) {
    return todayKey;
  }

  const daysUntilSunday = wd === 0 ? 7 : 7 - wd;
  return addDaysToKey(todayKey, daysUntilSunday);
}

export function computeChallengeEndDate(startDateKey: string, durationDays: number): string {
  return addDaysToKey(startDateKey, durationDays - 1);
}

/** ספירה לאחור עד חצות ירושלים של תאריך היעד */
export function countdownToDate(targetDateKey: string, now: Date = new Date()): {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  totalMs: number;
} {
  const todayKey = jerusalemDateKeyFromDate(now);
  if (targetDateKey <= todayKey) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, totalMs: 0 };
  }

  const start = parseDateKey(targetDateKey);
  const cur = parseDateKey(todayKey);
  const dayDiff = Math.round(
    (Date.UTC(start.y, start.m - 1, start.d) - Date.UTC(cur.y, cur.m - 1, cur.d)) / 86400000,
  );

  const minsIntoDay = jerusalemMinutesIntoDay(now);
  const secsPart = now.getSeconds();
  const totalSecondsLeft = dayDiff * 86400 - minsIntoDay * 60 - secsPart;

  if (totalSecondsLeft <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, totalMs: 0 };
  }

  const days = Math.floor(totalSecondsLeft / 86400);
  const hours = Math.floor((totalSecondsLeft % 86400) / 3600);
  const minutes = Math.floor((totalSecondsLeft % 3600) / 60);
  const seconds = totalSecondsLeft % 60;
  return { days, hours, minutes, seconds, totalMs: totalSecondsLeft * 1000 };
}

/** יום נוכחי באתגר (1-based) */
export function currentChallengeDayIndex(
  startDateKey: string,
  endDateKey: string,
  now: Date = new Date(),
  simulatedDay?: number | null,
): number {
  if (simulatedDay != null && simulatedDay >= 1) return simulatedDay;

  const todayKey = jerusalemDateKeyFromDate(now);
  if (todayKey < startDateKey) return 0;
  if (todayKey > endDateKey) return 0;

  const start = parseDateKey(startDateKey);
  const cur = parseDateKey(todayKey);
  const startMs = Date.UTC(start.y, start.m - 1, start.d);
  const curMs = Date.UTC(cur.y, cur.m - 1, cur.d);
  return Math.floor((curMs - startMs) / 86400000) + 1;
}

export { SUNDAY_CUTOFF_HOUR };
