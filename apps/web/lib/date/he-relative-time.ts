const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

function diffInCalendarMonths(from: Date, to: Date): number {
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
}

function isSameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isExactlyMonthsAgo(from: Date, to: Date, months: number): boolean {
  const shifted = new Date(from);
  shifted.setMonth(shifted.getMonth() + months);
  return isSameCalendarDay(shifted, to);
}

export function formatHebrewRelativeTimeSmart(input: string | number | Date, nowInput?: Date): string {
  const at = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(at.getTime())) return '';

  const now = nowInput ?? new Date();
  const diffMs = Math.max(0, now.getTime() - at.getTime());
  const diffDays = Math.floor(diffMs / DAY_MS);

  if (diffMs < MINUTE_MS) return 'ממש עכשיו';

  if (diffMs < HOUR_MS) {
    const minutes = Math.floor(diffMs / MINUTE_MS);
    if (minutes <= 1) return 'לפני דקה';
    if (minutes === 2) return 'לפני שתי דקות';
    return `לפני ${minutes} דקות`;
  }

  if (diffMs < DAY_MS) {
    const hours = Math.floor(diffMs / HOUR_MS);
    if (hours <= 1) return 'לפני שעה';
    if (hours === 2) return 'לפני שעתיים';
    return `לפני ${hours} שעות`;
  }

  if (diffDays === 1) return 'אתמול';
  if (diffDays === 2) return 'שלשום';
  if (diffDays < 7) return `לפני ${diffDays} ימים`;

  if (diffDays < 14) return 'לפני שבוע';
  if (diffDays < 21) return 'לפני שבועיים';
  if (diffDays < 28) return `לפני ${Math.floor(diffDays / 7)} שבועות`;

  const calendarMonths = diffInCalendarMonths(at, now);

  if (calendarMonths <= 1) return 'לפני חודש';
  if (calendarMonths === 2) return 'לפני חודשיים';
  if (calendarMonths === 6 && isExactlyMonthsAgo(at, now, 6)) return 'לפני חצי שנה';

  if (calendarMonths < 12) return `לפני ${calendarMonths} חודשים`;

  const years = Math.floor(calendarMonths / 12);
  if (years <= 1) return 'לפני שנה';
  if (years === 2) return 'לפני שנתיים';
  return `לפני ${years} שנים`;
}
