/**
 * ברכה מלאה עם לוח עברי — ייבוא דינמי מצד לקוח כדי לא לגרור @hebcal/core ל-bundle הראשוני.
 */
import { detectHebrewMoment, type HebrewMoment } from './hebrew-calendar';
import {
  getTimeGreeting,
  type PersonalGreeting,
} from './greeting-time';

function getTimeGreetingForSolemnDay(now: Date = new Date()): string {
  const hour = Number.parseInt(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Jerusalem',
      hour: '2-digit',
      hour12: false,
    })
      .formatToParts(now)
      .find((p) => p.type === 'hour')?.value ?? '0',
    10
  );
  if (hour >= 6 && hour < 12) return 'בוקר,';
  if (hour >= 12 && hour < 17) return 'צהריים,';
  if (hour >= 17 && hour < 21) return 'ערב,';
  return 'לילה,';
}

export type { PersonalGreeting, HebrewMoment };

export function getPersonalGreeting(now: Date = new Date()): PersonalGreeting {
  const moment = detectHebrewMoment(now);

  const isSolemn =
    moment.kind === 'memorial' ||
    moment.kind === 'major_fast' ||
    moment.tone === 'solemn';

  const timeGreeting = isSolemn ? getTimeGreetingForSolemnDay(now) : getTimeGreeting(now);

  if (moment.kind === 'weekday') {
    return {
      timeGreeting,
      occasionGreeting: null,
      highlight: false,
      tone: null,
      moment,
    };
  }

  return {
    timeGreeting,
    occasionGreeting: moment.holidayLabel,
    highlight: moment.tone === 'festive',
    tone: moment.tone,
    moment,
  };
}
