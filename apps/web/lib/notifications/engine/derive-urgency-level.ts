/**
 * `deriveUrgencyLevel` — מיפוי רגשי עדין יותר מעל ה-`NotificationState`
 * הקיים. ה-state אחראי על *מתי* לשלוח (cadence), ה-urgencyLevel אחראי
 * על *איך* — איזה טון רגשי ה-LLM צריך לאמץ.
 *
 * 🎯 המקור: "הנחיה 1" של Claude שתיארה 5 רמות (gentle → check_in).
 *           הותאמה לציר `consecutive_missed_days` הקיים בפרויקט,
 *           ולא לציר "ימים ללא תגובה" של Claude (כי הם דברים שונים:
 *           ה-engine שלנו עוקב אחר *השלמת משימה*, לא תגובת צ'אט).
 *
 * המיפוי:
 *   • 0 ימים רצוף שלא בוצעו (זה היום הראשון):
 *       morning  → gentle          (חם, מעודד, פתיחה חיובית)
 *       noon     → friendly_nudge  (כבר נשלחה בוקר — "לא שמעתי ממך היום")
 *       evening  → friendly_nudge  (היום כמעט נגמר — מצדיק את השתיקה)
 *   • 1 יום רצוף שלא בוצע:
 *       → friendly_nudge   (שובב, לא שיפוטי, עם הומור עדין)
 *   • 2 ימים רצוף שלא בוצעו:
 *       → concerned        (אכפתי, קצת מודאג, אנושי)
 *   • 3+ ימים רצוף שלא בוצעו (זה DORMANT ב-state):
 *       → worried (3-6 ימים) / check_in (7+) — שני סוגי "געגוע".
 */

import type { TimeOfDay } from '../../types/notification-state';

export const URGENCY_LEVELS = [
  'gentle',
  'friendly_nudge',
  'concerned',
  'worried',
  'check_in',
] as const;
export type UrgencyLevel = (typeof URGENCY_LEVELS)[number];

export interface DeriveUrgencyInput {
  timeOfDay: TimeOfDay;
  /** מספר ימים *רצוף לפני היום* שהמשתמש לא ביצע. 0 = אתמול בוצע / יום ראשון בסטריק. */
  consecutiveMissedDays: number;
  /**
   * כמה התראות כבר נשלחו היום לפני ה-slot הנוכחי (0, 1 או 2).
   * ברירת מחדל 0 — לתאימות אחורה בטסטים.
   */
  notificationsTodaySent?: number;
}

export function deriveUrgencyLevel({
  timeOfDay,
  consecutiveMissedDays,
  notificationsTodaySent = 0,
}: DeriveUrgencyInput): UrgencyLevel {
  if (consecutiveMissedDays <= 0) {
    // יום ראשון בסטריק — בוקר חם; צהריים/ערב אחרי שכבר ניסינו היום.
    if (timeOfDay === 'morning' && notificationsTodaySent === 0) return 'gentle';
    return 'friendly_nudge';
  }
  if (consecutiveMissedDays === 1) return 'friendly_nudge';
  if (consecutiveMissedDays === 2) return 'concerned';
  if (consecutiveMissedDays <= 6) return 'worried';
  return 'check_in';
}

/**
 * תיאור-אורך-חיים אנושי של הסטריק החסר — נכנס ל-prompt כדי שה-LLM
 * יוכל לכתוב משפט טבעי בלי שאנחנו נצטרך לבנות מספר בטקסט.
 * המקור: helper מההנחיה השנייה (`buildTimeAgoText`), מותאם לציר ה-streak שלנו.
 */
export function buildTimeAgoTextHe(consecutiveMissedDays: number): string {
  if (consecutiveMissedDays <= 0) return 'עוד לא היום';
  if (consecutiveMissedDays === 1) return 'מאמש';
  if (consecutiveMissedDays === 2) return 'משלשום';
  if (consecutiveMissedDays === 3) return 'שלושה ימים';
  if (consecutiveMissedDays <= 6) return `${consecutiveMissedDays} ימים`;
  if (consecutiveMissedDays === 7) return 'שבוע';
  if (consecutiveMissedDays <= 13) return `${consecutiveMissedDays} ימים`;
  if (consecutiveMissedDays === 14) return 'שבועיים';
  return 'הרבה זמן';
}

/**
 * הנחיית סגנון פר-`UrgencyLevel`. הולך *בתוך* ה-system prompt כשורה אחת
 * קצרה — ה-LLM כבר מקבל את כל החוקים הכלליים של "אלמוג" משם, וזה רק
 * "מודולציה רגשית" של אותו פרסונה. אורך זהיר: עד ~20 מילים פר רמה.
 */
export const URGENCY_STYLE_HINTS_HE: Record<UrgencyLevel, string> = {
  gentle:
    'טון חם, מעודד, ידידותי. פתיחה חיובית. שאלה ספציפית (לא "איך הראש שלך"). אימוג\'י אחד טבעי.',
  friendly_nudge:
    'טון שובב ועדין, לא שיפוטי. משפט קצר. בלי "נסגור" או "יום נקי". דחיפה אחת לפעולה ספציפית.',
  concerned:
    'טון אכפתי, רגיש, קצת מודאג בלי דרמה. שאל ספציפית מה גורם לקושי. לא "מה תפס אותך".',
  worried:
    'טון חם מאוד, מתגעגע, מקבל. הזכר שגם ימים קשים זה אנושי ("אנחנו בני אדם"). לא להלחיץ.',
  check_in:
    'טון רגוע ונוכח, כמו חבר ישן שמתחבר אחרי הפסקה. שאל איך הוא ספציפית, לא על "הראש".',
};
