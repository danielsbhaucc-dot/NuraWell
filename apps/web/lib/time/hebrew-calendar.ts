/**
 * hebrew-calendar.ts
 * ------------------
 * זיהוי דינמי של שבת/חג/מוצ"ש/יום זיכרון/צום/ראש חודש עבור כל שנה, באמצעות
 * @hebcal/core. שמירת timezone קבוע ב-`Asia/Jerusalem`.
 *
 * זרימה:
 *   1. נמשכים אירועי hebcal של היום (+אתמול +מחר) לפי לוח ישראל (il=true).
 *   2. נבחר ה-flag הכי משמעותי לפי priorities (MAJOR_FAST > CHAG > CHOL_HAMOED
 *      > MODERN_HOLIDAY > MINOR_HOLIDAY > MINOR_FAST > ROSH_CHODESH).
 *   3. שבת/ערב שבת/מוצ"ש נגזרים מהיום בשבוע ושעה בישראל (פשוט וצפוי).
 *   4. ערב חג: אם מחר CHAG ועברנו 16:30 שעון ישראל.
 *   5. מוצאי חג: אם אתמול CHAG ולפני 06:00 שעון ישראל.
 *
 * ברכה (`holidayLabel`) — מותאמת אישית לכל יום: חם בחגים שמחים, מכובד
 * בימי זיכרון, רך בצומות. הברכות בנויות לבני אדם, לא תבניות.
 */

import { getHolidaysOnDate, HDate, flags, type HolidayEvent } from '@hebcal/core';

const ISRAEL_TZ = 'Asia/Jerusalem';

export type HebrewMomentKind =
  | 'shabbat'             // שבת — שבת בבוקר עד 20:00
  | 'shabbat_eve'         // ערב שבת — שישי מ-12:00 עד כניסת שבת
  | 'motzei_shabbat'      // מוצאי שבת — שבת 20:00 עד ראשון 06:00
  | 'weekend'             // שישי לפני 12:00
  | 'holiday'             // חג מלא — פסח/סוכות/שבועות/שמ"ע/ר"ה
  | 'holiday_eve'         // ערב חג — אחרי 16:30 ביום שלפני
  | 'motzei_chag'         // מוצאי חג — לפני 06:00 בבוקר אחרי
  | 'holiday_and_shabbat' // חג שחל בשבת
  | 'chol_hamoed'         // חול המועד
  | 'minor_holiday'       // חנוכה, פורים, ט"ו בשבט, ל"ג בעומר
  | 'modern_holiday'      // יום העצמאות, יום ירושלים — שמחים
  | 'memorial'            // יום השואה, יום הזיכרון — חמורים
  | 'major_fast'          // יום כיפור, ט' באב — חמורים
  | 'minor_fast'          // צום גדליה, י' טבת, י"ז תמוז, תענית אסתר
  | 'rosh_chodesh'        // ראש חודש
  | 'weekday';            // יום חול רגיל

export type HebrewMoment = {
  kind: HebrewMomentKind;
  /** ברכת היום הראויה — חמה לחגים, מכבדת בימי זיכרון, רכה בצומות. null ביום חול. */
  holidayLabel: string | null;
  /** האם הברכה "חגיגית" (זהב/הדגשה) או "חמורה" (כבוד/רוגע). */
  tone: 'festive' | 'solemn' | 'gentle' | null;
  /** התאריך העברי בעברית — "ה' בסיון תשפ"ו" וכו'. */
  hebrewDate: string | null;
};

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

function israelMinutesIntoDay(date: Date): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: ISRAEL_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const h = Number.parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10) || 0;
  const m = Number.parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0', 10) || 0;
  return h * 60 + m;
}

function israelWeekday(date: Date): number {
  const wdShort = new Intl.DateTimeFormat('en-US', {
    timeZone: ISRAEL_TZ,
    weekday: 'short',
  }).format(date);
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[wdShort] ?? 0;
}

function formatHebrewDate(date: Date): string | null {
  try {
    return new Intl.DateTimeFormat('he-u-ca-hebrew', {
      timeZone: ISRAEL_TZ,
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(date);
  } catch {
    return null;
  }
}

/**
 * המרת Date לתאריך אזרחי בלוח ירושלים. חשוב כי `getHolidaysOnDate(Date)`
 * משתמש בתאריך אזרחי לוקלי של הסביבה — בשרת זה UTC, לא בהכרח ישראל.
 * לכן ניצור HDate ידני מהיום האזרחי בירושלים.
 */
function hdateFromIsraelDate(date: Date): HDate {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ISRAEL_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const y = Number.parseInt(parts.find((p) => p.type === 'year')?.value ?? '0', 10);
  const m = Number.parseInt(parts.find((p) => p.type === 'month')?.value ?? '0', 10);
  const d = Number.parseInt(parts.find((p) => p.type === 'day')?.value ?? '0', 10);
  return new HDate(new Date(y, m - 1, d));
}

function addCivilDays(date: Date, deltaDays: number): Date {
  return new Date(date.getTime() + deltaDays * 24 * 60 * 60 * 1000);
}

// ------------------------------------------------------------------
// Event classification
// ------------------------------------------------------------------

type ClassifiedDay = {
  kind: HebrewMomentKind | null;
  label: string | null;
  tone: HebrewMoment['tone'];
  isChagFull: boolean;
};

/** טון + ברכה חמה לפי שם החג. הברכות נכתבו ידנית כדי להישמע אנושיות. */
function warmGreetingFor(basename: string, fallbackHe: string): { label: string; tone: HebrewMoment['tone'] } {
  /** חגי תורה הגדולים — בטון חגיגי וחם. */
  if (basename.startsWith('Rosh Hashana')) {
    return { label: 'שנה טובה ומתוקה, מאחלים לך בריאות וצמיחה', tone: 'festive' };
  }
  if (basename === 'Yom Kippur') {
    return { label: 'גמר חתימה טובה, צום קל ומלא משמעות', tone: 'solemn' };
  }
  if (basename === 'Sukkot' || basename.startsWith('Sukkot')) {
    return { label: 'חג סוכות שמח, ימים של אור ושמחה', tone: 'festive' };
  }
  if (basename === 'Shmini Atzeret' || basename === 'Simchat Torah') {
    return { label: 'חג שמח, רוקדים עם התורה', tone: 'festive' };
  }
  if (basename === 'Pesach' || basename.startsWith('Pesach')) {
    return { label: 'חג פסח כשר ושמח, חירות אמיתית', tone: 'festive' };
  }
  if (basename === 'Shavuot') {
    return { label: 'חג שבועות שמח, זמן מתן תורתנו', tone: 'festive' };
  }
  /** חוה"מ. */
  if (basename === 'Chol HaMoed Pesach' || basename.startsWith('Pesach Chol')) {
    return { label: 'מועדי פסח לשמחה, חוה"מ נעים', tone: 'gentle' };
  }
  if (basename === 'Chol HaMoed Sukkot' || basename.startsWith('Sukkot Chol')) {
    return { label: 'מועדים לשמחה, חוה"מ נעים', tone: 'gentle' };
  }
  if (basename === 'Hoshana Raba' || basename === "Hoshana Rabbah") {
    return { label: 'הושענא רבה, יום של תפילה ותקווה', tone: 'gentle' };
  }
  /** חגים מינוריים שמחים. */
  if (basename === 'Chanukah' || basename.startsWith('Chanukah')) {
    return { label: 'חנוכה שמח, נר אחד מאיר את כל החושך', tone: 'festive' };
  }
  if (basename === 'Purim' || basename === 'Shushan Purim') {
    return { label: 'פורים שמח, ימי שמחה וריקודים', tone: 'festive' };
  }
  if (basename === "Tu BiShvat" || basename === 'Tu BiShvat') {
    return { label: 'ט"ו בשבט שמח, יום נטיעות ופירות', tone: 'gentle' };
  }
  if (basename === 'Lag BaOmer') {
    return { label: 'ל"ג בעומר שמח, יום אש ושירה', tone: 'gentle' };
  }
  if (basename === 'Tu B\'Av' || basename === "Tu B'Av") {
    return { label: 'ט"ו באב, יום של אהבה ואחדות', tone: 'gentle' };
  }
  /** ימים מודרניים — חלקם שמחים, חלקם חמורים. */
  if (basename === "Yom HaAtzma'ut" || basename === 'Yom HaAtzmaut') {
    return { label: 'יום העצמאות שמח, גאווה ותקווה', tone: 'festive' };
  }
  if (basename === 'Yom Yerushalayim') {
    return { label: 'יום ירושלים שמח, אור על העיר', tone: 'festive' };
  }
  if (basename === 'Yom HaShoah') {
    return { label: 'יום השואה והגבורה — מתייחדים עם זכר הקדושים', tone: 'solemn' };
  }
  if (basename === 'Yom HaZikaron') {
    return { label: 'יום הזיכרון — מתייחדים עם זכר הנופלים והנפגעי טרור', tone: 'solemn' };
  }
  /** צומות. */
  if (basename === "Tish'a B'Av" || basename === "Tisha B'Av") {
    return { label: 'צום ט\' באב — מתאחדים בזיכרון. צום קל', tone: 'solemn' };
  }
  if (basename === 'Tzom Gedaliah' || basename === "Tzom Gedalia") {
    return { label: 'צום גדליה — צום קל ומועיל', tone: 'gentle' };
  }
  if (basename === 'Asara B\'Tevet' || basename === "Asara B'Tevet") {
    return { label: 'צום עשרה בטבת — צום קל', tone: 'gentle' };
  }
  if (basename === "Ta'anit Esther") {
    return { label: 'תענית אסתר — צום קל', tone: 'gentle' };
  }
  if (basename === 'Tzom Tammuz' || basename === "Shiva Asar B'Tammuz") {
    return { label: 'צום י"ז בתמוז — צום קל', tone: 'gentle' };
  }
  if (basename === "Ta'anit Bechorot") {
    return { label: 'תענית בכורות — לבכורות', tone: 'gentle' };
  }
  /** ראש חודש. */
  if (basename.startsWith('Rosh Chodesh')) {
    return { label: 'ראש חודש מבורך, חודש של חידוש', tone: 'gentle' };
  }
  /** ימים מיוחדים פחות נפוצים — נחזיר את התרגום העברי מ-hebcal כברירת מחדל רכה. */
  return { label: fallbackHe, tone: 'gentle' };
}

function classifyEvents(date: Date): ClassifiedDay {
  const hdate = hdateFromIsraelDate(date);
  let events: HolidayEvent[] = [];
  try {
    events = getHolidaysOnDate(hdate, true) ?? [];
  } catch {
    events = [];
  }
  if (events.length === 0) {
    return { kind: null, label: null, tone: null, isChagFull: false };
  }

  /**
   * priorities: גבוה → נמוך.
   * אנחנו רוצים להציג את האירוע "החשוב" של היום.
   */
  const sorted = [...events].sort((a, b) => priority(b) - priority(a));
  const top = sorted[0];
  const mask = top.getFlags();

  const hebrewName = (() => {
    try {
      return top.render('he');
    } catch {
      return top.getDesc();
    }
  })();
  const greet = warmGreetingFor(top.basename(), hebrewName);

  /** מיפוי flags → kind. */
  let kind: HebrewMomentKind;
  if (mask & flags.MAJOR_FAST) {
    /** יום כיפור כן כלול ב-CHAG, אבל יוצא לפניו ב-MAJOR_FAST — נשמור כ-major_fast. */
    kind = 'major_fast';
  } else if (mask & flags.CHAG) {
    kind = 'holiday';
  } else if (mask & flags.CHOL_HAMOED) {
    kind = 'chol_hamoed';
  } else if (mask & flags.MODERN_HOLIDAY) {
    /** הבחנה: יום השואה/יום הזיכרון = memorial. יום העצמאות/ירושלים = modern_holiday. */
    if (greet.tone === 'solemn') {
      kind = 'memorial';
    } else {
      kind = 'modern_holiday';
    }
  } else if (mask & flags.MINOR_HOLIDAY) {
    kind = 'minor_holiday';
  } else if (mask & flags.MINOR_FAST) {
    kind = 'minor_fast';
  } else if (mask & flags.ROSH_CHODESH) {
    kind = 'rosh_chodesh';
  } else {
    return { kind: null, label: null, tone: null, isChagFull: false };
  }

  return {
    kind,
    label: greet.label,
    tone: greet.tone,
    isChagFull: Boolean(mask & flags.CHAG) || Boolean(mask & flags.MAJOR_FAST),
  };
}

function priority(ev: { getFlags(): number }): number {
  const m = ev.getFlags();
  if (m & flags.MAJOR_FAST) return 100;
  if (m & flags.CHAG) return 90;
  if (m & flags.CHOL_HAMOED) return 80;
  if (m & flags.MODERN_HOLIDAY) return 70;
  if (m & flags.MINOR_HOLIDAY) return 60;
  if (m & flags.MINOR_FAST) return 50;
  if (m & flags.ROSH_CHODESH) return 40;
  if (m & flags.EREV) return 30;
  return 10;
}

// ------------------------------------------------------------------
// Main API
// ------------------------------------------------------------------

export function detectHebrewMoment(now: Date = new Date()): HebrewMoment {
  const wd = israelWeekday(now);
  const minutes = israelMinutesIntoDay(now);
  const hebrewDate = formatHebrewDate(now);

  const today = classifyEvents(now);
  const tomorrow = classifyEvents(addCivilDays(now, 1));
  const yesterday = classifyEvents(addCivilDays(now, -1));

  const isOnShabbat = wd === 6 && minutes < 20 * 60;
  const isShabbatEve = wd === 5 && minutes >= 12 * 60;
  const isMotzeiShabbat = (wd === 6 && minutes >= 20 * 60) || (wd === 0 && minutes < 6 * 60);
  const isWeekendStart = wd === 5 && minutes < 12 * 60;

  /** שבת + חג — חג מנצח בתווית, kind מיוחד. */
  if (isOnShabbat && today.isChagFull) {
    return {
      kind: 'holiday_and_shabbat',
      holidayLabel: today.label ? `שבת שלום ו${today.label.replace(/^חג /, 'חג ')}` : 'שבת שלום וחג שמח',
      tone: 'festive',
      hebrewDate,
    };
  }
  if (isOnShabbat) {
    return { kind: 'shabbat', holidayLabel: 'שבת שלום ומבורכת', tone: 'festive', hebrewDate };
  }
  if (isMotzeiShabbat) {
    return { kind: 'motzei_shabbat', holidayLabel: 'שבוע טוב ומבורך', tone: 'gentle', hebrewDate };
  }
  if (isShabbatEve) {
    return { kind: 'shabbat_eve', holidayLabel: 'שבת שלום ומבורכת', tone: 'festive', hebrewDate };
  }

  /** היום הוא חג / חוה"מ / יום זיכרון / צום / ר"ח. */
  if (today.kind && today.label) {
    return {
      kind: today.kind,
      holidayLabel: today.label,
      tone: today.tone,
      hebrewDate,
    };
  }

  /** ערב חג: מחר חג מלא ועברנו 16:30. */
  if (tomorrow.isChagFull && tomorrow.label && minutes >= 16 * 60 + 30) {
    return {
      kind: 'holiday_eve',
      holidayLabel: `ערב חג • ${tomorrow.label}`,
      tone: 'festive',
      hebrewDate,
    };
  }

  /** מוצאי חג: אתמול חג מלא ולפני 06:00. */
  if (yesterday.isChagFull && minutes < 6 * 60) {
    return {
      kind: 'motzei_chag',
      holidayLabel: 'מוצאי חג מבורך',
      tone: 'gentle',
      hebrewDate,
    };
  }

  /** סופ"ש — שישי בבוקר. */
  if (isWeekendStart) {
    return { kind: 'weekend', holidayLabel: 'סוף שבוע מהנה', tone: 'gentle', hebrewDate };
  }

  return { kind: 'weekday', holidayLabel: null, tone: null, hebrewDate };
}
