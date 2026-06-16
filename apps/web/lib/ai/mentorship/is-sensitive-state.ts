/**
 * זיהוי מצב רגשי רגיש — מפשט את ה-UI (מסתיר מטריקות מורכבות).
 */

import type { MentorshipStrategy } from './schema';

const SENSITIVE_KEYWORDS = [
  'פחד',
  'חרדה',
  'לחץ',
  'עומס',
  'כישלון',
  'ייאוש',
  'עצב',
  'דיכאון',
  'מתוסכל',
  'לחוץ',
  'stress',
  'anxiety',
  'fear',
  'failure',
  'overwhelm',
  'burnout',
  'depress',
];

export function isSensitiveMentalState(strategy: MentorshipStrategy): boolean {
  if (strategy.active_blockers.length > 0) return true;

  const haystack = strategy.psychological_approach.toLowerCase();
  return SENSITIVE_KEYWORDS.some((kw) => haystack.includes(kw.toLowerCase()));
}
