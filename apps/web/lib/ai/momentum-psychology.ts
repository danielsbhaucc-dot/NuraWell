/**
 * momentum-psychology.ts
 * ----------------------
 * מנוע המוטיבציה של אלמוג — עקרונות שינוי-התנהגות מבוססי-ראיות, בנק משפטים
 * אנושיים, ובורר יומי דטרמיניסטי. משותף לתקציר החי (dashboard-brief) ולבועת
 * הברכה בבית, כדי ששתי המערכות ידברו באותה שפה פסיכולוגית — חכמה ולא גנרית.
 *
 * המקורות (לטובת מי שמתחזק): Fresh-Start Effect (Dai/Milkman),
 * Self-Determination Theory (Deci & Ryan), Tiny Habits (BJ Fogg),
 * Implementation Intentions (Gollwitzer), Self-Compassion (Neff),
 * The Progress Principle (Amabile), Loss Aversion (Kahneman), זהות (Clear).
 */

import { normalizeHebrewDashes } from '../text/hebrew-dashes';

/** חלק היום — קובע ניסוח וטון. */
export type PartOfDay = 'morning' | 'noon' | 'evening' | 'night';

/**
 * בלוק עקרונות פסיכולוגיים לפרומפט ה-LLM. מנוסח כהנחיות חיוביות (מה לעשות),
 * כי דוגמאות חיוביות מלמדות טון אנושי טוב יותר מאיסורים.
 */
export const MOMENTUM_PSYCHOLOGY_PROMPT_BLOCK = `עקרונות מוטיבציה מבוססי-מחקר (יישם אותם בעדינות, בלי לצטט אותם):
- ניצחונות קטנים (Tiny Habits): צעד זעיר שכבר נעשה שווה יותר מתוכנית גדולה. הדגש את הקטן שכבר קרה.
- שמירת רצף (Loss Aversion): כשיש רצף — תן לו ערך, "חבל לשבור משהו יפה כזה". בלי איום, רק חום.
- אפקט ההתחלה החדשה (Fresh-Start Effect): יום חדש / בוקר / תחילת שבוע = דף נקי. נצל רגעים כאלה כהזמנה.
- חמלה עצמית (Self-Compassion): אחרי החמצה — אפס שיפוט ואפס אשמה. נפילה היא חלק מהדרך, לא כישלון.
- תמיכה באוטונומיה (SDT): הצע, אל תכתיב. "אם מתחשק לך", "בקצב שלך" — תחושת בחירה מגבירה מוטיבציה.
- כוונת יישום (Implementation Intention): כשאפשר, רמז ל"מתי ואיך" קונקרטי, לא ל"כדאי לך".
- עקרון ההתקדמות (Progress Principle): שיקוף התקדמות קטנה הוא הדלק המוטיבציוני החזק ביותר.
- זהות (Identity): חבר פעולה לזהות — "ככה נראה מישהו שבונה לעצמו הרגל", בלי פלקטיות.
- גיוון (Variable Reward): אל תחזור על אותו משפט יום אחרי יום. הפתע בניסוח, שמור על רעננות.`;

/** הנחיית מקפים לכל פרומפט שמייצר טקסט מול המשתמש. */
export const HEBREW_DASH_PROMPT_RULE =
  'מקפים: אל תשתמש לעולם במקף ארוך (—). למפריד בין משפטים השתמש בפסיק או בנקודה. ' +
  'למקף מחבר (למשל "כ־5", "בן־אדם") השתמש במקף עברי ־.';

/**
 * האש דטרמיניסטי קצר ממחרוזת — לבחירת משפט יומי יציב (לא מרצד בין רינדורים).
 */
function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/** בוחר פריט יציב מתוך מערך לפי seed (תאריך + שם → אותו משפט לאורך היום). */
export function pickDaily<T>(items: readonly T[], seed: string): T {
  if (items.length === 0) throw new Error('pickDaily: empty list');
  return items[hashSeed(seed) % items.length]!;
}

/** חלק היום לפי שעה בישראל. */
export function partOfDayInIsrael(now: Date = new Date()): PartOfDay {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jerusalem',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const hour = Number.parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10);
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'noon';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'night';
}

/**
 * בנק "ניצוצות" — חצאי-משפט מוטיבציה אנושיים, מבוססי-עקרונות, לשזירה בתקציר/ברכה.
 * כל קבוצה ממופה לסיטואציה כדי שהבחירה תהיה רלוונטית ולא גנרית.
 */
export const MOMENTUM_SPARKS = {
  /** רצף חזק — לחגוג ולשמר (Loss Aversion + Identity). */
  streak: [
    'הרצף הזה הוא לא מזל, זו אתה.',
    'ככה בדיוק נבנה הרגל שנשאר.',
    'הגוף כבר מתחיל להתרגל לקצב הטוב.',
    'כל יום כזה מקרב אותך לגרסה שאתה בונה.',
    'חבל לשבור משהו יפה כל כך, בוא נמשיך.',
  ],
  /** חזרה אחרי היעדרות — חמלה עצמית, בלי אשמה (Self-Compassion + Fresh Start). */
  comeback: [
    'אין כאן "להתחיל מהתחלה", רק להמשיך מאיפה שאתה.',
    'יום חדש, דף נקי, בלי חשבונות מאתמול.',
    'הדרך מחכה בדיוק במקום שעזבת.',
    'גם הפסקות הן חלק מהמסע, לא נפילה.',
    'הצעד הכי חשוב הוא זה שאחרי ההפסקה.',
  ],
  /** יש משהו קטן לעשות — צעד זעיר (Tiny Habits + Implementation Intention). */
  smallStep: [
    'אפילו צעד אחד קטן מזיז את המחט.',
    'לא חייבים הכל, אחד מספיק כדי להרגיש תנועה.',
    'הכי קשה זה להתחיל, אחר כך זה זורם.',
    'חמש דקות עכשיו שוות יותר משעה "מתישהו".',
    'דבר אחד קטן, ואתה כבר בכיוון.',
  ],
  /** התחלה — משתמש חדש או בלי התקדמות עדיין. */
  fresh: [
    'כל מסע גדול מתחיל בצעד קטן אחד.',
    'אתה לא צריך להיות מוכן, רק להתחיל.',
    'הצעד הראשון הוא תמיד הכי משמעותי.',
    'בלי לחץ, רק נתחיל ונראה לאן זה לוקח.',
  ],
  /** סגר את הכל — חגיגה והזנה של זהות (Progress Principle). */
  closed: [
    'סגרת את מה שהתחייבת, וזה לא מובן מאליו.',
    'זה היום שעליו תסתכל אחורה בעוד חודש.',
    'בדיוק ככה נראית עקביות.',
    'התקדמת היום, וזה הדלק להמשך.',
  ],
} as const;

export type MomentumSparkKey = keyof typeof MOMENTUM_SPARKS;

/** בוחר ניצוץ מוטיבציה יומי לסיטואציה — מנורמל מקפים, מוכן לתצוגה. */
export function pickMomentumSpark(key: MomentumSparkKey, seed: string): string {
  return normalizeHebrewDashes(pickDaily(MOMENTUM_SPARKS[key], `${seed}:${key}`));
}
