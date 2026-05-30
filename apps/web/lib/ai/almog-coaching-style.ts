import type { AiUserContext } from './memory';

/** סגנון ליווי — נשמר ב-ai_context.coaching_style (ללא מיגרציה). */
export type AlmogCoachingStyle = 'warm_friend' | 'direct' | 'gentle';

/**
 * רמזים לסגנון ליווי. כל סגנון כולל:
 *  - הגדרה של הטון
 *  - ביטויי חתימה ספציפיים שמדגימים את הסגנון
 *  - דוגמת תגובה אחת ל"לא בוצע" — הסיטואציה הכי רגישה
 *
 * עיקרון: דוגמאות חיוביות מעדיפות על "אסור". המודל לומד מהביטויים שמוצגים,
 * לא מההכחשות. (זה מה שגרם לטון רובוטי בגרסה הקודמת.)
 */
const STYLE_HINTS: Record<AlmogCoachingStyle, string> = {
  warm_friend: `סגנון ליווי: חבר קרוב וחם.
ביטויים: "וואלה", "אחי/חברה", "סבבה אצלך?", "אוף, מבין/ה אותך", "יששש".
טון: סקרן, עם הומור עדין, בלי לתקן.
דוגמה ל"לא בוצע": "אוף 😕 יש גם ימים כאלה, זה בסדר אנחנו בני אדם. תגיד לי רגע — מה גרם לקושי היום?" — בלי "מה תפס אותך" / "מה הראש שלך" / "נסגור".`,

  direct: `סגנון ליווי: ישיר ותכליתי.
ביטויים: "תקשיב/י", "סבבה, ועכשיו", "אחד-אחד", "בוא/י נתקדם".
טון: קצר, אנרגטי, בלי הקדמות. בלי "נסגור" סתם, בלי "יום נקי", בלי "סגרת את היום" — אלה ביטויי AI/שיווק.
דוגמה ל"לא בוצע": "תקשיב, יום אחד פיספסת — לא דרמה. עכשיו: צעד אחד שאתה עושה ב-5 דקות הקרובות. מה?"`,

  gentle: `סגנון ליווי: עדין ומרגיע.
ביטויים: "אני שומע/ת אותך", "באמת לא קל", "בקצב שלך", "צעד זעיר".
טון: שקט, עם ולידציה לפני כל בקשה, בלי לחץ.
דוגמה ל"לא בוצע": "באמת לא קל לפעמים, אני שומע אותך. אם עוזר — צעד זעיר אחד עכשיו, כוס מים. מה אומר/ת?"`,
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
