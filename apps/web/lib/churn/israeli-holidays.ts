/**
 * זיהוי "היום שאחרי חג" לפי לוח עברי, ל-Passive Presence trigger.
 *
 * משתמש ב-Intl hebrew calendar (ללא תלות חיצונית) כדי לזהות את היום שאחרי
 * חגים מרכזיים בישראל — רגעים שבהם הסיכוי לחזרה גבוה (Fresh Start טבעי).
 *
 * זו הערכה מספיק טובה ל-trigger רך; היא לא תחליף ללוח שנה הלכתי מדויק.
 */

export type PassiveTrigger = 'month_start' | 'monday' | 'post_holiday';

/** "היום שאחרי" כל חג (חודש עברי + יום) — סוף החג בישראל + 1. */
const POST_HOLIDAY_MARKERS: ReadonlyArray<{ month: string; day: number }> = [
  { month: 'Tishri', day: 3 }, // אחרי ראש השנה (א'-ב' תשרי)
  { month: 'Tishri', day: 11 }, // אחרי יום כיפור (י' תשרי)
  { month: 'Tishri', day: 23 }, // אחרי סוכות/שמחת תורה (כ"ב תשרי)
  { month: 'Nisan', day: 22 }, // אחרי פסח (ט"ו-כ"א ניסן בישראל)
  { month: 'Sivan', day: 7 }, // אחרי שבועות (ו' סיון בישראל)
];

function hebrewParts(date: Date, timeZone: string): { month: string; day: number } | null {
  try {
    const fmt = new Intl.DateTimeFormat('en-u-ca-hebrew', {
      timeZone,
      month: 'long',
      day: 'numeric',
    });
    const parts = fmt.formatToParts(date);
    const month = parts.find((p) => p.type === 'month')?.value ?? '';
    const dayRaw = parts.find((p) => p.type === 'day')?.value ?? '';
    const day = Number.parseInt(dayRaw, 10);
    if (!month || !Number.isFinite(day)) return null;
    // נורמליזציה קלה: Intl עשוי להחזיר "Tishri" או וריאנט — משאירים כמו שהוא.
    return { month, day };
  } catch {
    return null;
  }
}

/** האם `date` הוא היום שאחרי אחד מהחגים המרכזיים (לפי לוח עברי). */
export function isDayAfterIsraeliHoliday(
  date: Date,
  timeZone = 'Asia/Jerusalem'
): boolean {
  const parts = hebrewParts(date, timeZone);
  if (!parts) return false;
  return POST_HOLIDAY_MARKERS.some(
    (m) => m.month === parts.month && m.day === parts.day
  );
}

/**
 * מזהה את ה-trigger הרלוונטי ל-passive presence ביום הנתון.
 * עדיפות: post_holiday > month_start > monday. null = אין trigger מיוחד.
 */
export function detectPassiveTrigger(
  now: Date,
  timeZone = 'Asia/Jerusalem'
): PassiveTrigger | null {
  if (isDayAfterIsraeliHoliday(now, timeZone)) return 'post_holiday';

  // יום בחודש + יום בשבוע ב-TZ ישראל.
  const dayStr = new Intl.DateTimeFormat('en-US', {
    timeZone,
    day: 'numeric',
  }).format(now);
  const day = Number.parseInt(dayStr, 10);
  if (day === 1) return 'month_start';

  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
  }).format(now);
  if (weekday === 'Mon') return 'monday';

  return null;
}
