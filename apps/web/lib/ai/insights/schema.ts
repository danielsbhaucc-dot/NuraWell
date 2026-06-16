/**
 * סכמת הפלט המובנית של מנוע חילוץ התובנות (Insight Extraction Engine).
 *
 * זהו "החוזה" בין מודל ה-LLM הרקעי (generateObject) למסד הנתונים: המודל מחזיר
 * *אך ורק* מבנה שתואם את הסכמה הזו, ואנחנו מאמתים אותו בצורה מחמירה לפני שמירה.
 * השדות ממופים 1:1 לעמודות בטבלת `user_insights` (ראה 000056_user_insights.sql).
 */

import { z } from 'zod';

/**
 * קטגוריות התובנה. תואם ל-CHECK constraint של עמודת `category`:
 *  - fitness / nutrition / mental → תחומי תוכן.
 *  - blocker      → נקודת חיכוך / חסם מנטלי שמעכב את המשתמש.
 *  - goal         → יעד מיידי או ארוך-טווח.
 *  - preference   → העדפה *סמויה* שהמשתמש לא ציין במפורש ("מתקשה עם שגרת בוקר").
 *  - missing_info → נתון שחסר לנו; מה שהמנטור צריך לברר *בעדינות* בעתיד.
 */
export const InsightCategory = z.enum([
  'fitness',
  'nutrition',
  'mental',
  'blocker',
  'goal',
  'preference',
  'missing_info',
]);
export type InsightCategory = z.infer<typeof InsightCategory>;

/**
 * תובנה בודדת. `.strict()` חוסם שדות-לוואי שהמודל עלול להמציא, כדי שהפלט יישאר
 * נקי וניתן-לאחסון.
 */
export const ExtractedInsight = z
  .object({
    category: InsightCategory,

    /**
     * ניסוח התובנה בעברית, מנקודת מבט עליו ("המשתמש נוטה ל...").
     * עבור `missing_info` — זה תיאור הנתון שחסר ("לא ברור מתי הוא הולך לישון").
     */
    insight_text: z
      .string()
      .min(4, 'תובנה קצרה מדי')
      .max(400, 'תובנה ארוכה מדי'),

    /**
     * כמה התובנה ניתנת-לפעולה למנטור (1=הקשר טריוויאלי, 10=מנוף שינוי ישיר).
     * משמש לדירוג מה להזריק לפרומפט כשהתקציב מוגבל.
     */
    actionability_score: z.number().int().min(1).max(10),

    /** ביטחון המודל בתובנה (0..1). תובנות מתחת לסף ייזרקו לפני שמירה. */
    confidence: z.number().min(0).max(1),

    /**
     * עבור `missing_info` בלבד: ניסוח רך ולא-חודרני שהמנטור יכול לשזור בשיחה
     * כדי לאסוף את הנתון ("אגב, מתי בדרך כלל מתחיל היום שלך?"). אופציונלי.
     */
    probe_question: z.string().max(240).optional(),

    /** ראיה תומכת קצרה מתוך השיחה (לאבחון/דיבוג). לא נשמר בפרומפט. */
    evidence: z.string().max(300).optional(),
  })
  .strict();
export type ExtractedInsight = z.infer<typeof ExtractedInsight>;

/**
 * עטיפת התוצאה. המודל חייב להחזיר אובייקט עם המפתח `insights` (לא מערך חשוף) —
 * זה ידידותי יותר ל-generateObject ול-JSON mode של רוב הספקים.
 */
export const InsightExtractionResult = z
  .object({
    insights: z.array(ExtractedInsight).max(12),
  })
  .strict();
export type InsightExtractionResult = z.infer<typeof InsightExtractionResult>;

/** תוצאה ריקה — כשאין מה לחלץ או כשהקריאה נכשלה. */
export const EMPTY_EXTRACTION: InsightExtractionResult = { insights: [] };
