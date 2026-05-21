/**
 * hebrew-calendar.ts
 * ------------------
 * זיהוי שבת, מוצאי שבת, ערב שבת, וחגים יהודיים מרכזיים — לטובת ברכות אישיות בעברית.
 *
 *  - חישובי לוח עברי באמצעות `Intl.DateTimeFormat('en-GB-u-ca-hebrew')`. אין צורך
 *    בלוקליזציה מלאה — אנחנו רק צריכים לזהות תאריך עברי + חג כדי להציג ברכה.
 *  - כל החישובים נעשים ב-`Asia/Jerusalem`.
 *  - שבת מתחילה בכניסת שבת המקובלת (שישי 18:00) ומסתיימת במוצאי שבת המקובל
 *    (שבת 20:00). זו פשטה אינטואיטיבית — לא הלכתית — אבל מספיק טוב לברכה.
 *  - "סופ"ש" מוגדר: שישי אחה"צ (12:00 ואילך) עד מוצאי שבת.
 *  - "מוצאי שבת" מוגדר: שבת מ-20:00 עד ראשון 06:00.
 *
 * אם בעתיד נצטרך לוח שבעבר את החגים החלים בערב מסוים (entrance/exit) — נחליף לספריית
 * `@hebcal/core`. כרגע מספיק מה שיש פה.
 */

export type HebrewMomentKind =
  | 'shabbat'           /** בעצם שבת — שבת מבוקר עד 20:00 */
  | 'shabbat_eve'       /** ערב שבת — שישי מ-12:00 עד כניסת שבת */
  | 'motzei_shabbat'    /** מוצאי שבת — שבת 20:00 עד ראשון 06:00 */
  | 'weekend'           /** שישי לפני 12:00 (ברכה "סופ"ש מהנה") */
  | 'holiday'           /** חג בודד */
  | 'holiday_eve'       /** ערב חג — אחרי 16:30 ביום שלפני חג מלא */
  | 'motzei_chag'       /** מוצאי חג — לילה/בוקר אחרי חג */
  | 'holiday_and_shabbat' /** חג שחל בשבת */
  | 'chol_hamoed'       /** חול המועד פסח/סוכות */
  | 'rosh_chodesh'      /** ראש חודש */
  | 'weekday';

export type HebrewMoment = {
  kind: HebrewMomentKind;
  /** שם החג/המועד לתצוגה (כולל "שמח"/"כשר ושמח"/"טוב") — null ביום חול רגיל */
  holidayLabel: string | null;
  /** התאריך העברי בעברית — "כ"ה תשרי" וכו'. שימושי כדי להציג בצורה משלימה. */
  hebrewDate: string | null;
};

const ISRAEL_TZ = 'Asia/Jerusalem';

/** דקה מתחילת היום (0..1439) בלוח ירושלים. */
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

/** 0=ראשון .. 6=שבת לפי לוח ירושלים. */
function israelWeekday(date: Date): number {
  const wdShort = new Intl.DateTimeFormat('en-US', {
    timeZone: ISRAEL_TZ,
    weekday: 'short',
  }).format(date);
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[wdShort] ?? 0;
}

/**
 * חודש עברי + יום עברי + שנה — באמצעות הלוח של Intl.
 * דוגמת פלט: { day: 25, month: 'Tishri', year: 5786 }.
 */
type HebrewParts = { day: number; monthName: string; year: number };

function hebrewParts(date: Date): HebrewParts {
  /** קלנדר עברי + שפת en-GB → שמות החודשים באנגלית, נוח להשוואה. */
  const parts = new Intl.DateTimeFormat('en-GB-u-ca-hebrew', {
    timeZone: ISRAEL_TZ,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).formatToParts(date);
  const day = Number.parseInt(parts.find((p) => p.type === 'day')?.value ?? '0', 10) || 0;
  const monthName = parts.find((p) => p.type === 'month')?.value ?? '';
  const year = Number.parseInt(parts.find((p) => p.type === 'year')?.value ?? '0', 10) || 0;
  return { day, monthName, year };
}

/** תאריך עברי לתצוגה בעברית: "כ"ה תשרי תשפ"ו". */
function formatHebrewDate(date: Date): string | null {
  try {
    const heFormatter = new Intl.DateTimeFormat('he-u-ca-hebrew', {
      timeZone: ISRAEL_TZ,
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    return heFormatter.format(date);
  } catch {
    return null;
  }
}

/**
 * Mapping חגים יהודיים — בהתבסס על חודש+יום בלוח העברי.
 * שמות החודשים מ-Intl באנגלית הם:
 *  Tishri, Heshvan, Kislev, Tevet, Shevat, Adar, Adar I, Adar II, Nisan, Iyar, Sivan, Tammuz, Av, Elul
 *
 * תאריכי החגים הסטנדרטיים בארץ:
 *  - ראש השנה: תשרי 1-2
 *  - יום כיפור: תשרי 10
 *  - סוכות: תשרי 15-21 (15 חג, 16-20 חוה"מ, 21 הושענא רבה)
 *  - שמיני עצרת/שמחת תורה (בארץ ביום אחד): תשרי 22
 *  - חנוכה: כסלו 25 – טבת 2/3 (8 ימים)
 *  - ט"ו בשבט: שבט 15
 *  - פורים: אדר/אדר ב' 14 (טו' שושן פורים בירושלים)
 *  - פסח: ניסן 15-21 (15 ו-21 חג, 16-20 חוה"מ)
 *  - יום העצמאות: איר 5 (תזוזות אפשריות)
 *  - ל"ג בעומר: איר 18
 *  - שבועות (בארץ ביום אחד): סיון 6
 *  - תשעה באב: אב 9 (תזוזה ל-10 כשחל בשבת)
 */
function holidayForHebrewDate(parts: HebrewParts): { label: string; isMajor: boolean } | null {
  const { day, monthName } = parts;
  /** ראש השנה */
  if (monthName === 'Tishri') {
    if (day === 1 || day === 2) return { label: 'שנה טובה ומבורכת', isMajor: true };
    if (day === 10) return { label: 'גמר חתימה טובה', isMajor: true };
    if (day === 15) return { label: 'חג סוכות שמח', isMajor: true };
    if (day >= 16 && day <= 20) return { label: 'מועדים לשמחה', isMajor: false };
    if (day === 21) return { label: 'הושענא רבה', isMajor: false };
    if (day === 22) return { label: 'חג שמיני עצרת ושמחת תורה שמח', isMajor: true };
  }
  /** חנוכה — בכל מקרה היום 25 בכסלו ועד 2/3 בטבת. */
  if (monthName === 'Kislev' && day >= 25) return { label: 'חנוכה שמח', isMajor: false };
  if (monthName === 'Tevet' && day <= 3) return { label: 'חנוכה שמח', isMajor: false };
  /** ט"ו בשבט */
  if (monthName === 'Shevat' && day === 15) return { label: 'ט"ו בשבט שמח', isMajor: false };
  /** פורים — אדר רגיל / אדר ב' */
  if ((monthName === 'Adar' || monthName === 'Adar II') && day === 14) {
    return { label: 'פורים שמח', isMajor: false };
  }
  if ((monthName === 'Adar' || monthName === 'Adar II') && day === 15) {
    /** שושן פורים — בירושלים זה ה-14, ובכל הארץ זה היום אחרי. נשתמש בברכה רכה. */
    return { label: 'פורים שמח', isMajor: false };
  }
  /** פסח */
  if (monthName === 'Nisan') {
    if (day === 15 || day === 21) return { label: 'חג פסח כשר ושמח', isMajor: true };
    if (day >= 16 && day <= 20) return { label: 'מועדי חוה"מ פסח לשמחה', isMajor: false };
  }
  /** יום העצמאות — קלאסי 5 באייר. */
  if (monthName === 'Iyar' && day === 5) return { label: 'יום עצמאות שמח', isMajor: false };
  /** ל"ג בעומר */
  if (monthName === 'Iyar' && day === 18) return { label: 'ל"ג בעומר שמח', isMajor: false };
  /** שבועות — בארץ יום אחד, ו' סיון. */
  if (monthName === 'Sivan' && day === 6) return { label: 'חג שבועות שמח', isMajor: true };
  /** תשעה באב — יום צום, ברכה שונה. */
  if (monthName === 'Av' && day === 9) return { label: 'צום קל', isMajor: false };
  return null;
}

/** Date object שמייצג +24h ביחס ל-`now`. */
function addDays(date: Date, deltaDays: number): Date {
  return new Date(date.getTime() + deltaDays * 24 * 60 * 60 * 1000);
}

/**
 * הזיהוי המלא: שבת/מוצ"ש/חג/חוה"מ/יום חול.
 *
 *  - אם חג בשבת — מוחזר 'holiday_and_shabbat' עם תווית חג.
 *  - אם שבת רגילה — 'shabbat' / 'motzei_shabbat' / 'shabbat_eve'.
 *  - 'weekend' לוכד שישי לפני 12:00 — לפני שמגיע "ערב שבת".
 *  - "ערב חג" — אחרי 16:30 בערב שלפני חג מלא (החג בלוח העברי הוא ב-day+1
 *    אזרחי), כי החג בפועל מתחיל בשקיעה. הברכה: "ערב X טוב, חג X שמח".
 *  - "מוצאי חג" — לפני 06:00 לאחר חג מלא — הברכה "מוצאי חג מבורך".
 */
export function detectHebrewMoment(now: Date = new Date()): HebrewMoment {
  const wd = israelWeekday(now);
  const minutes = israelMinutesIntoDay(now);
  const parts = hebrewParts(now);
  const holiday = holidayForHebrewDate(parts);
  const hebrewDate = formatHebrewDate(now);

  /** בדיקת "מחר חג" — לסיכוי של ערב חג אחרי 16:30. */
  const tomorrowParts = hebrewParts(addDays(now, 1));
  const tomorrowHoliday = holidayForHebrewDate(tomorrowParts);
  /** בדיקת "אתמול חג" — לסיכוי של מוצאי חג לפני 06:00. */
  const yesterdayParts = hebrewParts(addDays(now, -1));
  const yesterdayHoliday = holidayForHebrewDate(yesterdayParts);

  /** שבת קלאסית: יום שבת (6) עד 20:00. */
  const isOnShabbat = wd === 6 && minutes < 20 * 60;
  /** ערב שבת: שישי (5) מ-12:00 עד סוף היום. */
  const isShabbatEve = wd === 5 && minutes >= 12 * 60;
  /** מוצאי שבת: שבת אחרי 20:00 או ראשון לפני 06:00. */
  const isMotzeiShabbat =
    (wd === 6 && minutes >= 20 * 60) || (wd === 0 && minutes < 6 * 60);
  /** סופ"ש "עצמאי": שישי לפני 12:00. */
  const isWeekendStart = wd === 5 && minutes < 12 * 60;

  if (isOnShabbat && holiday) {
    return {
      kind: 'holiday_and_shabbat',
      holidayLabel: holiday.label,
      hebrewDate,
    };
  }
  if (isOnShabbat) {
    return { kind: 'shabbat', holidayLabel: null, hebrewDate };
  }
  if (isMotzeiShabbat) {
    return { kind: 'motzei_shabbat', holidayLabel: null, hebrewDate };
  }
  if (isShabbatEve) {
    return { kind: 'shabbat_eve', holidayLabel: null, hebrewDate };
  }
  if (holiday) {
    /** חוה"מ מקבלים תווית אבל לא נחשבים "חג מלא". */
    const isCholHamoed = holiday.label.startsWith('מועדים') || holiday.label.startsWith('מועדי');
    return {
      kind: isCholHamoed ? 'chol_hamoed' : 'holiday',
      holidayLabel: holiday.label,
      hebrewDate,
    };
  }
  /**
   * ערב חג: שעון אזרחי עוד לא עבר חצות, אבל בפועל החג כבר נכנס בשקיעה.
   * אחרי 16:30 בערב לפני חג מלא — להציג "ערב חג, חג X שמח".
   * (לא חוה"מ — חוה"מ כבר מקבל תווית "מועדים לשמחה" בעצמו.)
   */
  if (
    tomorrowHoliday &&
    tomorrowHoliday.isMajor &&
    minutes >= 16 * 60 + 30
  ) {
    return {
      kind: 'holiday_eve',
      holidayLabel: tomorrowHoliday.label,
      hebrewDate,
    };
  }
  /**
   * מוצאי חג: עברנו חצות לתוך יום חדש, אבל אתמול היה חג מלא — עד 06:00
   * עדיין מציגים "מוצאי חג מבורך".
   */
  if (
    yesterdayHoliday &&
    yesterdayHoliday.isMajor &&
    minutes < 6 * 60
  ) {
    return {
      kind: 'motzei_chag',
      holidayLabel: yesterdayHoliday.label,
      hebrewDate,
    };
  }
  if (isWeekendStart) {
    return { kind: 'weekend', holidayLabel: null, hebrewDate };
  }
  /** ראש חודש — היום הראשון של כל חודש עברי. ה-30 נחשב לפעמים כראש חודש של החודש הבא, אבל פשטה כאן. */
  if (parts.day === 1) {
    return { kind: 'rosh_chodesh', holidayLabel: 'ראש חודש מבורך', hebrewDate };
  }
  return { kind: 'weekday', holidayLabel: null, hebrewDate };
}
