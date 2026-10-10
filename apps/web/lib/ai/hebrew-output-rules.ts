/**
 * Shared Hebrew output rules for background LLM prompts (gpt-oss).
 * Same convention as the main chat (genderAddressingHint in app/api/v1/ai/chat/route.ts):
 * known gender → consistent masculine/feminine; unknown → genuinely neutral phrasing.
 */
export type HebrewGender = 'male' | 'female' | null | undefined;

export function hebrewAddressingRule(gender: HebrewGender): string {
  if (gender === 'female') {
    return 'פנייה: המשתמשת היא נקבה — כל פנייה בגוף שני בלשון נקבה, בעקביות (בלי לערבב זכר ונקבה באותו משפט).';
  }
  if (gender === 'male') {
    return 'פנייה: המשתמש הוא זכר — כל פנייה בגוף שני בלשון זכר, בעקביות (בלי לערבב זכר ונקבה באותו משפט).';
  }
  return 'פנייה: המגדר לא ידוע — נסח ניטרלי באמת (שם פועל / רבים / ניסוח לא מוטה), ואל תערבב זכר ונקבה.';
}

/** כל ערך טקסטואלי חופשי בתשובת JSON — בעברית. מזהים/enum נשארים כפי שהוגדרו בסכימה. */
export const HEBREW_JSON_VALUES_RULE =
  'כל ערך טקסט חופשי ב-JSON (למשל main_goal, main_obstacle, summary, headline, body) — בעברית תקנית בלבד. ערכי enum/מזהים (כמו male/female, שמות שדות) — בדיוק כפי שמוגדרים בסכימה.';
