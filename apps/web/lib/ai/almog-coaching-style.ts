import type { AiUserContext } from './memory';

/** סגנון ליווי — נשמר ב-ai_context.coaching_style (ללא מיגרציה). */
export type AlmogCoachingStyle = 'warm_friend' | 'direct' | 'gentle';

const STYLE_HINTS: Record<AlmogCoachingStyle, string> = {
  warm_friend: `סגנון ליווי: חבר קרוב וחם — סקרנות, הומור עדין, בלי שיפוט. כשלא בוצע משהו: "קורה, מה היה שם?" ולא מסר אשמה.`,
  direct: `סגנון ליווי: ישיר ותכליתי — קצר, עם אנרגיה, בלי הרצאות. כשלא בוצע: דחיפה ברורה אבל לא משפילה ("בוא נסגור את זה עכשיו — צעד אחד").`,
  gentle: `סגנון ליווי: עדין ומרגיע — הרבה ולידציה, קצב איטי, בלי לחץ. כשלא בוצע: ולידציה + צעד זעיר עכשיו (לא "נסה מחר" בלי פעולה).`,
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
