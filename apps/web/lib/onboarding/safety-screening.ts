/**
 * Onboarding safety screening (launch-readiness B6). Stored in profiles.safety_screening together with the
 * health-data consent. Not a block — it adapts the program and shows referral guidance.
 */
export type SafetyScreening = {
  version: 1;
  answered_at: string;
  ed_history: boolean;
  pregnancy: boolean;
  fluid_restriction: boolean;
  medical_followup: boolean;
  minor: boolean;
  /** derived: no weight inputs/reminders/targets and no weight talk */
  no_weight: boolean;
  /** derived: water habit gets the alternative version */
  fluid_restriction_alt: boolean;
  /** derived: show "talk to a clinician" guidance */
  recommend_clinician: boolean;
};

export function buildSafetyScreening(a: {
  edHistory: boolean;
  pregnancy: boolean;
  fluidRestriction: boolean;
  medicalFollowup: boolean;
  minor: boolean;
}): SafetyScreening & { fluid_restriction: boolean } {
  return {
    version: 1,
    answered_at: new Date().toISOString(),
    ed_history: a.edHistory,
    pregnancy: a.pregnancy,
    fluid_restriction: a.fluidRestriction,
    medical_followup: a.medicalFollowup,
    minor: a.minor,
    no_weight: a.edHistory || a.pregnancy || a.minor,
    fluid_restriction_alt: a.fluidRestriction,
    recommend_clinician: a.edHistory || a.pregnancy || a.fluidRestriction || a.medicalFollowup,
  };
}

/** Hebrew guidance shown right after the user ticks a screening item (neutral, no slash forms). */
export const SCREENING_GUIDANCE = {
  ed_history:
    'תודה ששיתפת. NuraWell מתמקדת בהרגלים ובהרגשה — בלי שקילה, בלי ספירת קלוריות ובלי יעדי משקל. חשוב שהתהליך ילווה גם באיש מקצוע (רופא המשפחה או מרפאה להפרעות אכילה בקופה). ברגע קשה: ער״ן 1201.',
  pregnancy:
    'בהריון או בהנקה לא מציבים יעדי משקל. נתמקד בהרגלים עדינים, ומומלץ לתאם כל שינוי תזונתי עם הרופא או האחות המלווים.',
  fluid_restriction:
    'כשיש מצב כליות, לב או הגבלת נוזלים — לא מגדילים שתייה בלי רופא. בתחנת המים נציע חלופה מותאמת.',
  medical_followup:
    'כשיש מצב רפואי במעקב (למשל סוכרת), כדאי לעדכן את הרופא המטפל לפני שינויים בתזונה. התוכנית מבוססת הרגלים קטנים ולא מחליפה ייעוץ רפואי.',
} as const;
