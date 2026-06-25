/**
 * זמן יחסי בעברית, אזור Asia/Jerusalem.
 * מיועד לתצוגה ב-UI (SOS, התראות, היסטוריה, צ'אט וכו').
 */

const TZ = 'Asia/Jerusalem';

export type HebrewRelativeOptions = {
  /** אתמול/שלשום עם שעה (ברירת מחדל: false — רק "אתמול") */
  includeTimeOfDay?: boolean;
  /** חותמת עכשיו — לבדיקות / רענון */
  nowMs?: number;
  /** אחרי כמה ימים לעבור לתאריך מוחלט (ברירת מחדל ~13 חודשים) */
  absoluteAfterDays?: number;
};

function dayKeyInJerusalem(ms: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(ms);
}

function parseDayKeyUtc(key: string): number {
  const [y, mo, d] = key.split('-').map(Number);
  return Date.UTC(y, mo - 1, d);
}

function daysBetweenDateKeys(laterKey: string, earlierKey: string): number {
  const diff = parseDayKeyUtc(laterKey) - parseDayKeyUtc(earlierKey);
  return Math.round(diff / 86400000);
}

function timeInJerusalem(ms: number): string {
  return new Intl.DateTimeFormat('he-IL', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(ms);
}

function formatJerusalemDateShort(ms: number): string {
  return new Intl.DateTimeFormat('he-IL', {
    timeZone: TZ,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(ms);
}

function formatJerusalemDateFromKey(dateKey: string, weekday?: 'short' | 'long'): string {
  const d = new Date(`${dateKey}T12:00:00`);
  return new Intl.DateTimeFormat('he-IL', {
    timeZone: TZ,
    weekday,
    day: 'numeric',
    month: 'short',
    year: dateKey.slice(0, 4) !== dayKeyInJerusalem(Date.now()).slice(0, 4) ? 'numeric' : undefined,
  }).format(d);
}

/** הפרש ימים לוחיים בין שתי חותמות זמן */
function calendarDaysAgo(pastMs: number, nowMs: number): number {
  return daysBetweenDateKeys(dayKeyInJerusalem(nowMs), dayKeyInJerusalem(pastMs));
}

function hebrewMinutesCount(m: number): string {
  if (m === 1) return 'דקה';
  if (m === 2) return 'שתי דקות';
  return `${m} דקות`;
}

function hebrewHoursCount(h: number): string {
  if (h === 1) return 'שעה';
  if (h === 2) return 'שעתיים';
  return `${h} שעות`;
}

function hebrewDaysCount(d: number): string {
  if (d === 1) return 'יום';
  if (d === 2) return 'יומיים';
  return `${d} ימים`;
}

function hebrewMonthsCount(m: number): string {
  if (m === 1) return 'חודש';
  if (m === 2) return 'חודשיים';
  if (m >= 3 && m <= 10) return `${m} חודשים`;
  return `${m} חודשים`;
}

function hebrewYearsCount(y: number): string {
  if (y === 1) return 'שנה';
  if (y === 2) return 'שנתיים';
  if (y >= 3 && y <= 10) return `${y} שנים`;
  return `${y} שנים`;
}

function formatCalendarDaysAgo(
  calDays: number,
  includeTimeOfDay: boolean,
  pastMs: number
): string {
  if (calDays === 1) {
    return includeTimeOfDay ? `אתמול ב־${timeInJerusalem(pastMs)}` : 'אתמול';
  }
  if (calDays === 2) {
    return includeTimeOfDay ? `שלשום ב־${timeInJerusalem(pastMs)}` : 'שלשום';
  }
  if (calDays >= 3 && calDays <= 6) {
    return `לפני ${hebrewDaysCount(calDays)}`;
  }
  if (calDays === 7) return 'לפני שבוע';
  if (calDays >= 8 && calDays <= 13) {
    return `לפני ${hebrewDaysCount(calDays)}`;
  }
  if (calDays === 14) return 'לפני שבועיים';
  if (calDays >= 15 && calDays < 30) {
    return `לפני ${hebrewDaysCount(calDays)}`;
  }
  if (calDays >= 30 && calDays < 45) return 'לפני חודש';
  if (calDays >= 45 && calDays < 60) return 'לפני חודש וחצי';
  if (calDays >= 60 && calDays < 90) return 'לפני חודשיים';
  if (calDays >= 90 && calDays < 180) return 'לפני חצי שנה';
  if (calDays >= 180 && calDays < 365) {
    const months = Math.max(6, Math.round(calDays / 30));
    return `לפני ${hebrewMonthsCount(months)}`;
  }
  if (calDays >= 365 && calDays < 730) return 'לפני שנה';
  if (calDays >= 730 && calDays < 1095) return 'לפני שנתיים';
  const years = Math.floor(calDays / 365);
  return `לפני ${hebrewYearsCount(years)}`;
}

function formatSameDayMinutes(totalMins: number): string {
  if (totalMins < 1) return 'עכשיו';
  if (totalMins === 1) return 'לפני דקה';
  if (totalMins === 2) return 'לפני שתי דקות';
  if (totalMins === 30) return 'לפני חצי שעה';
  if (totalMins < 60) return `לפני ${hebrewMinutesCount(totalMins)}`;

  const totalHours = Math.floor(totalMins / 60);
  if (totalHours === 1) return 'לפני שעה';
  if (totalHours === 2) return 'לפני שעתיים';
  return `לפני ${hebrewHoursCount(totalHours)}`;
}

/**
 * זמן יחסי מ-ISO (חותמת מלאה).
 * ברירת מחדל: אתמול/שלשום בלי שעה — מתאים לכרטיסים ורשימות.
 */
export function formatHebrewRelative(iso: string, options: HebrewRelativeOptions = {}): string {
  const nowMs = options.nowMs ?? Date.now();
  const includeTimeOfDay = options.includeTimeOfDay ?? false;
  const absoluteAfterDays = options.absoluteAfterDays ?? 400;

  const d = new Date(iso);
  const t = d.getTime();
  if (Number.isNaN(t) || t > nowMs + 60_000) return 'עכשיו';

  const calDays = calendarDaysAgo(t, nowMs);
  if (calDays >= absoluteAfterDays) {
    return formatJerusalemDateShort(t);
  }

  if (calDays >= 1) {
    return formatCalendarDaysAgo(calDays, includeTimeOfDay, t);
  }

  const totalMins = Math.floor((nowMs - t) / 60_000);
  return formatSameDayMinutes(totalMins);
}

/** תאימות לאחור — התראות וכו׳ (עם שעה באתמול/שלשום) */
export function formatHebrewRelativeTime(iso: string, nowMs: number = Date.now()): string {
  return formatHebrewRelative(iso, { nowMs, includeTimeOfDay: true });
}

/**
 * זמן יחסי ממפתח תאריך YYYY-MM-DD (לוח ירושלים).
 * לדוגמה: היסטוריית משימות, פופאפ יום.
 */
export function formatHebrewRelativeFromDateKey(
  dateKey: string,
  todayKey: string,
  options: { longAfterDays?: number } = {}
): string {
  if (dateKey === todayKey) return 'היום';

  const calDays = daysBetweenDateKeys(todayKey, dateKey);
  if (calDays < 0) return formatJerusalemDateFromKey(dateKey, 'short');

  const longAfter = options.longAfterDays ?? 14;
  if (calDays > longAfter) {
    return formatJerusalemDateFromKey(dateKey, calDays > 60 ? 'long' : 'short');
  }

  return formatCalendarDaysAgo(calDays, false, parseDayKeyUtc(dateKey));
}
