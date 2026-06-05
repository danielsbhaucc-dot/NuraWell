import { z } from 'zod';

/* ============================================================
 * משפטי שיווק/פסיכולוגיה בלופ — עמוד "בקרוב".
 * נשמרים ב-site_settings.coming_soon_revolution_lines (jsonb).
 * *כוכביות* מסמנות מילים מודגשות (גרדיאנט) ב-ComingSoonExperience.
 * ============================================================ */

export const DEFAULT_REVOLUTION_LINES: string[] = [
  'השינוי האמיתי לא מתחיל בצלחת — הוא מתחיל ב*מחשבה אחת* שאתה מאמין בה.',
  'אתה לא צריך עוד דיאטה. אתה צריך *מערכת שמבינה אותך*.',
  'כל בחירה קטנה היום בונה את *האדם שתהיה מחר*.',
  '*NuraWell* לא סופרת קלוריות — היא בונה מחדש את *הביטחון שלך*.',
  'הגוף מקשיב לכל מילה שאתה אומר לעצמך. *בוא נשנה את השיחה.*',
  'מנטור AI שלא שופט ולא לוחץ — רק *מלווה אותך קדימה*.',
  'לא עוד "מחר אני מתחיל". *המחר מתחיל עכשיו.*',
  'השלווה שחיפשת נמצאת בצד השני של *ההרגלים החדשים*.',
  'אתה במרחק *החלטה אחת* מהגרסה הכי טובה של עצמך.',
  'בריאות היא לא יעד — היא *הדרך שבה אתה חי* כל יום.',
  'כשאתה מפסיק להילחם בגוף — *הוא מתחיל לעבוד איתך*.',
  'זה לא עוד ניסיון. זו *הגרסה שבה אתה נשאר*.',
];

export const revolutionLineSchema = z.string().trim().min(1).max(280);

export const comingSoonRevolutionLinesSchema = z
  .array(revolutionLineSchema)
  .min(1, 'נדרש לפחות משפט אחד')
  .max(24, 'עד 24 משפטים');

/** המרה בטוחה מ-jsonb (unknown) למערך משפטים, או null אם לא תקין. */
export function parseRevolutionLines(raw: unknown): string[] | null {
  const parsed = comingSoonRevolutionLinesSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** משפטים לתצוגה — מותאמים אישית או ברירת מחדל. */
export function resolveRevolutionLines(stored: string[] | null | undefined): string[] {
  if (stored && stored.length > 0) return stored;
  return DEFAULT_REVOLUTION_LINES;
}
