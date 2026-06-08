/**
 * hebrew-dashes.ts
 * ----------------
 * נרמול מקפים לעברית תקנית בטקסט שמוצג למשתמש.
 *
 * כללים:
 *  1. מקף מחבר (כ-5, בן-אדם, ב-2024) → מקף עברי ־ (U+05BE).
 *  2. טווח מספרים עם מקף ארוך (5–7) → מקף עברי בין הספרות (5־7).
 *  3. מקף ארוך — / – (em/en dash) ששימש כמפריד משפט → פסיק.
 *     לא משאירים מקף ארוך עברי בכלל.
 *
 * נועד לטקסט מול המשתמש בלבד (פלט AI, מחרוזות דינמיות) — לא לקוד/הערות.
 */

/** מקף עברי (maqaf) — מחבר צמוד בלי רווחים. */
export const HEBREW_MAQAF = '\u05BE';

const HEBREW_LETTER = '\u0590-\u05FF';

/**
 * ממיר טקסט עברי למקפים תקניים:
 *  - מקף ארוך כמפריד → פסיק.
 *  - מקף מחבר → מקף עברי ־.
 */
export function normalizeHebrewDashes(input: string | null | undefined): string {
  if (!input) return input ?? '';
  let out = input;

  // טווח מספרים עם מקף ארוך/קצר ללא רווחים: 5–7 / 5-7 → 5־7
  out = out.replace(/(\d)[—–-](\d)/g, `$1${HEBREW_MAQAF}$2`);

  // מקף ארוך (em/en) עם רווחים — מפריד משפט → פסיק
  out = out.replace(/\s+[—–]\s+/g, ', ');

  // מקף ארוך שנותר (צמוד או בקצה) → פסיק עם רווח, ואז ניקוי קצוות
  out = out.replace(/[—–]/g, ', ');
  out = out.replace(/\s+,/g, ',');
  out = out.replace(/,\s*,/g, ',');
  out = out.replace(/^\s*,\s*/, '');
  out = out.replace(/\s*,\s*$/, '');

  // מקף מחבר רגיל: אות עברית + "-" + אות עברית/ספרה (ללא רווחים) → מקף עברי
  out = out.replace(
    new RegExp(`([${HEBREW_LETTER}])-(?=[${HEBREW_LETTER}0-9])`, 'g'),
    `$1${HEBREW_MAQAF}`
  );
  // ספרה + "-" + אות עברית צמוד (5-דקות) → מקף עברי
  out = out.replace(
    new RegExp(`(\\d)-(?=[${HEBREW_LETTER}])`, 'g'),
    `$1${HEBREW_MAQAF}`
  );

  return out;
}
