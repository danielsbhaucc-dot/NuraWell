/**
 * greeting.ts
 * -----------
 * ברכה אישית — לפי שעה בישראל + רגישות לחג/שבת/יום זיכרון/צום.
 * הברכה החמה עצמה מגיעה כבר מ-`hebrew-calendar.ts`. כאן רק עוטפים אותה
 * עם ברכת שעה ועם tone לתצוגה.
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

export type IsraelTimeOfDayBucket = 'morning' | 'noon' | 'evening' | 'night';

export type IsraelTimeOfDay = {
  /** ברכה בלי פסיק — "בוקר טוב" / "צהריים טובים". */
  greeting: string;
  bucket: IsraelTimeOfDayBucket;
};

/**
 * חלק היום לפי שעון ישראל — מקור אמת לברכות בכל המסכים
 * (בית, מסע, תוכנית). ספים: בוקר עד 12, צהריים עד 17, ערב עד 21.
 */
export function getIsraelTimeOfDay(now: Date = new Date()): IsraelTimeOfDay {
  const hour = israelHour(now);
  if (hour >= 5 && hour < 12) return { greeting: 'בוקר טוב', bucket: 'morning' };
  if (hour >= 12 && hour < 17) return { greeting: 'צהריים טובים', bucket: 'noon' };
  if (hour >= 17 && hour < 21) return { greeting: 'ערב טוב', bucket: 'evening' };
  return { greeting: 'לילה טוב', bucket: 'night' };
}

/** ברכת שעה בלבד — בלי שכבת חג. */
export function getTimeGreeting(now: Date = new Date()): string {
  const hour = israelHour(now);
  if (hour === 5) return 'חמש לפנות בוקר,';
  const { greeting } = getIsraelTimeOfDay(now);
  return `${greeting},`;
}

/**
 * ברכה לימי זיכרון — לא "בוקר טוב", אלא טון שקט יותר.
 * בימי השואה והזיכרון לא הולמת ברכת בוקר חגיגית.
 */
function getTimeGreetingForSolemnDay(now: Date = new Date()): string {
  const hour = israelHour(now);
  if (hour >= 6 && hour < 12) return 'בוקר,';
  if (hour >= 12 && hour < 17) return 'צהריים,';
  if (hour >= 17 && hour < 21) return 'ערב,';
  return 'לילה,';
}

export type PersonalGreeting = {
  /** "בוקר טוב," / "צהריים טובים," — כולל פסיק. ביום זיכרון בלי "טוב". */
  timeGreeting: string;
  /** השכבה האישית של היום: חג/שבת/יום זיכרון/צום/ר"ח. null אם אין. */
  occasionGreeting: string | null;
  /** האם להבליט (זהב), להציג רגוע (לבן), או "חמור" (אפור-לבן רך). */
  highlight: boolean;
  /** טון הברכה — לתצוגה: festive=זהב, solemn=נר רוגע, gentle=ירוק רך. */
  tone: 'festive' | 'solemn' | 'gentle' | null;
  /** ה-moment עצמו, לשימוש קוד צרכן. */
  moment: HebrewMoment;
};

/**
 * הברכה הראשית — משלבת שעה ושכבת חג/שבת/זיכרון.
 *
 * דוגמאות (ברכה החמה מגיעה מ-hebrew-calendar):
 *   weekday           → "בוקר טוב, [שם]"
 *   shabbat_eve       → "צהריים טובים, [שם]" + "שבת שלום ומבורכת"
 *   shabbat           → "בוקר טוב, [שם]" + "שבת שלום ומבורכת"
 *   motzei_shabbat    → "ערב טוב, [שם]" + "שבוע טוב ומבורך"
 *   holiday (שבועות)  → "בוקר טוב, [שם]" + "חג שבועות שמח, זמן מתן תורתנו"
 *   holiday_eve       → "ערב טוב, [שם]" + "ערב חג • חג שבועות שמח..."
 *   motzei_chag       → "לילה טוב, [שם]" + "מוצאי חג מבורך"
 *   memorial (שואה)   → "בוקר, [שם]" + "יום השואה והגבורה — מתייחדים..."
 *   memorial (זיכרון) → "ערב, [שם]" + "יום הזיכרון — מתייחדים..."
 *   major_fast (יוה"כ)→ "ערב, [שם]" + "גמר חתימה טובה, צום קל..."
 *   minor_fast        → "בוקר טוב, [שם]" + "צום י"ז בתמוז — צום קל"
 *   rosh_chodesh      → "בוקר טוב, [שם]" + "ראש חודש מבורך, חודש של חידוש"
 *   aseret_y. teshuvah→ "בוקר טוב, [שם]" + "עשרת ימי תשובה — ימים של חשבון נפש"
 *   chol_hamoed       → "בוקר טוב, [שם]" + "מועדים לשמחה — חול המועד..."
 *   weekend           → "בוקר טוב, [שם]" + "סוף שבוע מהנה"
 */
export function getPersonalGreeting(now: Date = new Date()): PersonalGreeting {
  const moment = detectHebrewMoment(now);

  /** ימי זיכרון לאומיים + צום גדול = טון כבוד. אין "טוב" במילת הברכה. */
  const isSolemn =
    moment.kind === 'memorial' ||
    moment.kind === 'major_fast' ||
    moment.tone === 'solemn';

  const timeGreeting = isSolemn ? getTimeGreetingForSolemnDay(now) : getTimeGreeting(now);

  /** ב-weekday רגיל אין שכבה — מציגים רק "בוקר טוב, X". */
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
