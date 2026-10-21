/** גרסת מסמכים משפטיים — לעדכן בכל שינוי מהותי במדיניות/תנאים. */
export const LEGAL_POLICY_VERSION = '2026-10-20';

/** גיל מינימלי לשימוש בשירות: 18 ומעלה בלבד (מדיניות פרטיות, תנאי שימוש). */
export const MIN_USER_AGE = 18;

/** גיל בגירות. זהה לגיל המינימלי: אין הרשמה של קטינים. */
export const ADULT_AGE = 18;

export const CONSENT_TYPES = {
  terms: 'terms',
  privacy: 'privacy',
  healthData: 'health_data',
  parentalGuardian: 'parental_guardian',
  ageDeclaration: 'age_declaration',
  adminTranscriptAccess: 'admin_transcript_access',
} as const;

export type ConsentType = (typeof CONSENT_TYPES)[keyof typeof CONSENT_TYPES];
