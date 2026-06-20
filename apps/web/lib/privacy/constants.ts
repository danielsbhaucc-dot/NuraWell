/** גרסת מסמכים משפטיים — לעדכן בכל שינוי מהותי במדיניות/תנאים. */
export const LEGAL_POLICY_VERSION = '2026-06-20';

/** גיל מינימלי לשימוש בשירות (מדיניות פרטיות §12). */
export const MIN_USER_AGE = 16;

/** גיל בגירות מלאה ללא הסכמת הורה (תנאי שימוש §4). */
export const ADULT_AGE = 18;

export const CONSENT_TYPES = {
  terms: 'terms',
  privacy: 'privacy',
  healthData: 'health_data',
  parentalGuardian: 'parental_guardian',
  ageDeclaration: 'age_declaration',
} as const;

export type ConsentType = (typeof CONSENT_TYPES)[keyof typeof CONSENT_TYPES];
