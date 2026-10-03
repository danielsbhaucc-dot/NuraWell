/**
 * ברכת שעה בלבד — בלי @hebcal/core. בטוח לייבוא סטטי מצד לקוח.
 */

const ISRAEL_TZ = 'Asia/Jerusalem';

function israelHour(date: Date): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: ISRAEL_TZ,
    hour: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const h = Number.parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10);
  return Number.isFinite(h) ? h : 0;
}

export type IsraelTimeOfDayBucket = 'morning' | 'noon' | 'evening' | 'night';

export type IsraelTimeOfDay = {
  greeting: string;
  bucket: IsraelTimeOfDayBucket;
};

export function getIsraelTimeOfDay(now: Date = new Date()): IsraelTimeOfDay {
  const hour = israelHour(now);
  if (hour >= 5 && hour < 12) return { greeting: 'בוקר טוב', bucket: 'morning' };
  if (hour >= 12 && hour < 17) return { greeting: 'צהריים טובים', bucket: 'noon' };
  if (hour >= 17 && hour < 21) return { greeting: 'ערב טוב', bucket: 'evening' };
  return { greeting: 'לילה טוב', bucket: 'night' };
}

export function getTimeGreeting(now: Date = new Date()): string {
  const hour = israelHour(now);
  if (hour === 5) return 'חמש לפנות בוקר,';
  const { greeting } = getIsraelTimeOfDay(now);
  return `${greeting},`;
}

export type PersonalGreeting = {
  timeGreeting: string;
  occasionGreeting: string | null;
  highlight: boolean;
  tone: 'festive' | 'solemn' | 'gentle' | null;
  moment: {
    kind: string;
    holidayLabel: string | null;
    tone: 'festive' | 'solemn' | 'gentle' | null;
    hebrewDate: string | null;
  };
};

/** ברכת שעה בלבד — placeholder עד שנטען לוח עברי (דינמי). */
export function getTimeOnlyPersonalGreeting(now: Date = new Date()): PersonalGreeting {
  return {
    timeGreeting: getTimeGreeting(now),
    occasionGreeting: null,
    highlight: false,
    tone: null,
    moment: {
      kind: 'weekday',
      holidayLabel: null,
      tone: null,
      hebrewDate: null,
    },
  };
}
