/**
 * זמן יחסי בעברית, אזור Asia/Jerusalem.
 * מיועד לעדכון תצוגה (קריאה חוזרת עם Date.now() חדש).
 */

const TZ = 'Asia/Jerusalem';

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

function timeInJerusalem(ms: number): string {
  return new Intl.DateTimeFormat('he-IL', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(ms);
}

/** הפרש ימים לוחיים: כמה ימים עברו מאז `pastMs` עד `nowMs` (עשרוני מעוגל) */
function calendarDaysAgo(pastMs: number, nowMs: number): number {
  const a = parseDayKeyUtc(dayKeyInJerusalem(pastMs));
  const b = parseDayKeyUtc(dayKeyInJerusalem(nowMs));
  return Math.round((b - a) / 86400000);
}

function hebrewHoursCount(h: number): string {
  if (h === 1) return 'שעה';
  if (h === 2) return 'שעתיים';
  if (h >= 3 && h <= 10) return `${h} שעות`;
  return `${h} שעות`;
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

/**
 * מחרוזת יחסית בעברית: לפני דקה, חצי שעה, אתמול ב־…, לפני שבוע, וכו׳.
 */
export function formatHebrewRelativeTime(iso: string, nowMs: number = Date.now()): string {
  const d = new Date(iso);
  const t = d.getTime();
  if (Number.isNaN(t) || t > nowMs + 60_000) return 'עכשיו';

  const diffMs = nowMs - t;
  const totalMins = Math.floor(diffMs / 60_000);

  if (totalMins < 1) return 'עכשיו';
  if (totalMins === 1) return 'לפני דקה';
  if (totalMins === 2) return 'לפני שתי דקות';
  if (totalMins === 30) return 'לפני חצי שעה';
  if (totalMins < 60) return `לפני ${totalMins} דקות`;

  const totalHours = Math.floor(totalMins / 60);
  if (totalHours < 24) {
    if (totalHours === 1) return 'לפני שעה';
    if (totalHours === 2) return 'לפני שעתיים';
    return `לפני ${hebrewHoursCount(totalHours)}`;
  }

  const calDays = calendarDaysAgo(t, nowMs);

  if (calDays === 1) {
    return `אתמול ב־${timeInJerusalem(t)}`;
  }
  if (calDays === 2) {
    return `שלשום ב־${timeInJerusalem(t)}`;
  }
  if (calDays >= 3 && calDays <= 6) {
    return `לפני ${calDays} ימים`;
  }
  if (calDays === 7) return 'לפני שבוע';
  if (calDays >= 8 && calDays <= 13) {
    return `לפני ${calDays} ימים`;
  }
  if (calDays === 14) return 'לפני שבועיים';
  if (calDays >= 15 && calDays < 30) {
    return `לפני ${calDays} ימים`;
  }

  const approxMonths = Math.floor(calDays / 30);
  if (approxMonths >= 1 && approxMonths < 12) {
    return `לפני ${hebrewMonthsCount(approxMonths)}`;
  }

  const approxYears = Math.floor(calDays / 365);
  if (approxYears < 1) {
    return `לפני ${hebrewMonthsCount(11)}`;
  }
  return `לפני ${hebrewYearsCount(approxYears)}`;
}
