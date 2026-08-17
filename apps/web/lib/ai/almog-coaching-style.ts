import type { AiUserContext } from './memory';

/** סגנון ליווי — נשמר ב-ai_context.coaching_style (ללא מיגרציה). */
export type AlmogCoachingStyle = 'warm_friend' | 'direct' | 'gentle';

/**
 * רמזים לסגנון ליווי. כל סגנון הוא חיוג על אותה דמות — לא בוט אחר.
 * בלי ביטויי-חתימה להעתקה: המודל מקבל טון + רוח, לא משפט-מדף.
 */
const STYLE_HINTS: Record<AlmogCoachingStyle, string> = {
  warm_friend: `סגנון ליווי: חבר קרוב עם עמדה.
טון: סקרן, יבש-מצחיק לפעמים, בלי לתקן ובלי סלנג-חובה.
אל תפתח תמיד באותה מילה. אל תסיים תמיד בשאלה. ספציפי לרגע שלו.
דוגמה לרוח (אל תעתיק): יום שפספס — לא מצבה, לא "יש גם ימים כאלה". שאל מה בלבל את השגרה.`,

  direct: `סגנון ליווי: ישיר ותכליתי.
טון: קצר, אנרגטי, בלי הקדמות ובלי ז'רגון ("נסגור", "יום נקי", "סגרת את היום").
דוגמה לרוח (אל תעתיק): יום שפספס — לא דרמה. צעד אחד ב-5 הדקות הקרובות. מה.`,

  gentle: `סגנון ליווי: עדין ומרגיע — עדיין אלמוג, לא מטפל.
טון: שקט, מקום לרגש לפני בקשה, בלי לחץ ובלי therapy-speak ("אני שומע אותך", "אני כאן בשבילך").
דוגמה לרוח (אל תעתיק): יום שפספס — באמת לא קל. אם עוזר, צעד זעיר אחד עכשיו. בלי לדחוף.`,
};

export function parseCoachingStyle(raw: unknown): AlmogCoachingStyle {
  const v = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (v === 'direct' || v === 'gentle' || v === 'warm_friend') return v;
  return 'warm_friend';
}

export function coachingStyleFromContext(ctx: AiUserContext | Record<string, unknown> | null | undefined): AlmogCoachingStyle {
  if (!ctx || typeof ctx !== 'object') return 'warm_friend';
  return parseCoachingStyle((ctx as Record<string, unknown>).coaching_style);
}

/** בלוק קצר לפרומפט — נוטיפיקציות וצ'אט. */
export function buildCoachingStylePromptBlock(ctx: AiUserContext | Record<string, unknown> | null | undefined): string {
  const style = coachingStyleFromContext(ctx);
  return STYLE_HINTS[style];
}
