/**
 * greeting.ts
 * -----------
 * ברכת זמן בעברית — לפי שעה בירושלים, עם רגישות לשבת/חג/מוצ"ש/סופ"ש.
 *
 *  - שעון: תמיד `Asia/Jerusalem` (לא תלוי במכשיר).
 *  - שבת/חג/מוצ"ש מוסיפים שכבה נוספת ("בוקר טוב, X — שבת שלום").
 *  - סופ"ש מהנה מופיע ביום שישי בבוקר.
 */

import { detectHebrewMoment, type HebrewMoment } from './hebrew-calendar';

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

/** ברכה לפי השעה ביום בלבד (בלי שכבת שבת/חג). */
export function getTimeGreeting(now: Date = new Date()): string {
  const hour = israelHour(now);
  if (hour === 5) return 'חמש לפנות בוקר,';
  if (hour >= 6 && hour < 12) return 'בוקר טוב,';
  if (hour >= 12 && hour < 17) return 'צהריים טובים,';
  if (hour >= 17 && hour < 21) return 'ערב טוב,';
  return 'לילה טוב,';
}

export type PersonalGreeting = {
  /** ברכת זמן בסיסית (כולל פסיק בסוף): "בוקר טוב," / "צהריים טובים," */
  timeGreeting: string;
  /** שכבת חג/שבת/סופ"ש — להוספה אחרי השם. אם null אין מה להוסיף. */
  occasionGreeting: string | null;
  /** "כשרון פוטוגני" של הברכה לתצוגה — אם זה חג מלא, להבליט קצת יותר. */
  highlight: boolean;
  /** ה-moment עצמו, לשימוש קוד צרכן (analytics/תצוגה משלימה). */
  moment: HebrewMoment;
};

/**
 * הברכה הראשית שמוצגת בבית — משלבת שעה ושכבת חג/שבת.
 *
 * דוגמאות:
 *   weekday      → "בוקר טוב," + null               → "בוקר טוב, דנה"
 *   shabbat_eve  → "צהריים טובים," + "שבת שלום"     → "צהריים טובים, דנה — שבת שלום ✦"
 *   shabbat      → "בוקר טוב," + "שבת שלום"         → "בוקר טוב, דנה — שבת שלום ✦"
 *   motzei_shabbat → "ערב טוב," + "שבוע טוב"         → "ערב טוב, דנה — שבוע טוב ✨"
 *   holiday      → "בוקר טוב," + "חג סוכות שמח"     → "בוקר טוב, דנה — חג סוכות שמח 🕯️"
 *   holiday_and_shabbat → "בוקר טוב," + "שבת שלום, חג שמח" → "בוקר טוב, דנה — שבת שלום וחג שמח ✦"
 *   weekend      → "בוקר טוב," + "סוף שבוע מהנה"    → "בוקר טוב, דנה — סוף שבוע מהנה 🌿"
 */
export function getPersonalGreeting(now: Date = new Date()): PersonalGreeting {
  const moment = detectHebrewMoment(now);
  const timeGreeting = getTimeGreeting(now);
  let occasionGreeting: string | null = null;
  let highlight = false;

  switch (moment.kind) {
    case 'shabbat':
      occasionGreeting = 'שבת שלום';
      highlight = true;
      break;
    case 'shabbat_eve':
      occasionGreeting = 'שבת שלום ומבורכת';
      highlight = true;
      break;
    case 'motzei_shabbat':
      occasionGreeting = 'שבוע טוב ומבורך';
      highlight = true;
      break;
    case 'weekend':
      occasionGreeting = 'סוף שבוע מהנה';
      highlight = false;
      break;
    case 'holiday':
      occasionGreeting = moment.holidayLabel ?? 'חג שמח';
      highlight = true;
      break;
    case 'holiday_eve':
      /** ערב חג: "ערב חג שבועות, חג שמח" / "ערב חג סוכות, חג שמח". */
      occasionGreeting = moment.holidayLabel
        ? `ערב חג • ${moment.holidayLabel}`
        : 'ערב חג, חג שמח';
      highlight = true;
      break;
    case 'motzei_chag':
      occasionGreeting = 'מוצאי חג מבורך';
      highlight = true;
      break;
    case 'holiday_and_shabbat':
      /** "שבת שלום וחג סוכות שמח" וכו'. אם יש tag "חג" בתווית — שילוב מסודר. */
      occasionGreeting = moment.holidayLabel
        ? `שבת שלום ו${moment.holidayLabel.replace(/^חג /, 'חג ')}`
        : 'שבת שלום וחג שמח';
      highlight = true;
      break;
    case 'chol_hamoed':
      occasionGreeting = moment.holidayLabel ?? 'מועדים לשמחה';
      highlight = false;
      break;
    case 'rosh_chodesh':
      occasionGreeting = 'ראש חודש מבורך';
      highlight = false;
      break;
    case 'weekday':
    default:
      occasionGreeting = null;
      highlight = false;
      break;
  }

  return { timeGreeting, occasionGreeting, highlight, moment };
}
