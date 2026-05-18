import type { OnboardingGender } from '@/lib/onboarding/types';
import { genderCopy } from '@/lib/onboarding/gender-copy';

export type WelcomeEmailCopy = {
  subject: string;
  headline: string;
  intro: string;
  summaryTitle: string;
  summarySubtitle: string;
  closing: string;
  cta: string;
  noReplyTop: string;
  noReplyBottom: string;
  textPlain: string;
};

export function welcomeEmailCopy(
  firstName: string,
  gender: OnboardingGender | null | undefined
): WelcomeEmailCopy {
  const gc = genderCopy(gender ?? '');
  const name = firstName.trim() || 'חבר/ה';

  const introMale = `${name}, שמחתי לאשר את האימייל שלך! קיבלתי את כל מה שמילאת בהרשמה — ושמרתי לך סיכום קצר כאן למטה. מכאן אלמוג ילווה אותך במסע, ואני כאן אם תרצה לחזור לשאלות על ההרשמה.`;
  const introFemale = `${name}, שמחתי לאשר את האימייל שלך! קיבלתי את כל מה שמילאת בהרשמה — ושמרתי לך סיכום קצר כאן למטה. מכאן אלמוג תלווה אותך במסע, ואני כאן אם תרצי לחזור לשאלות על ההרשמה.`;
  const introNeutral = `${name}, שמחתי לאשר את האימייל שלך! קיבלתי את כל מה שמילאת בהרשמה — ושמרתי לך סיכום קצר כאן למטה. מכאן אלמוג ילווה אותך במסע, ואני כאן אם תרצה/י לחזור לשאלות על ההרשמה.`;

  const intro =
    gender === 'male' ? introMale
    : gender === 'female' ? introFemale
    : introNeutral;

  const supportLine =
    gender === 'male' ? 'לשאלות ותמיכה השתמש באפליקציה או בדף יצירת קשר.'
    : gender === 'female' ? 'לשאלות ותמיכה השתמשי באפליקציה או בדף יצירת קשר.'
    : 'לשאלות ותמיכה השתמש/י באפליקציה או בדף יצירת קשר.';

  return {
    subject: `${name}, ${gc.welcome} ל-NuraWell — דולב כאן`,
    headline: `${name}, ${gc.welcome}! 🌿`,
    intro,
    summaryTitle: 'דו״ח סיכום ההרשמה — מדולב',
    summarySubtitle: 'מה ששמרתי עליך:',
    closing: 'בהצלחה רבה במסע — בקצב שלך, בלי שיפוט ובלי לחץ.',
    cta: 'כניסה לאפליקציה',
    noReplyTop: '⚠️ אין להשיב לכתובת מייל זו — התיבה אינה מנוטרת',
    noReplyBottom: `שוב — אין להשיב למייל זה. ${supportLine}`,
    textPlain: `⚠️ אין להשיב לכתובת מייל זו\n\n${name}, ${gc.welcome} ל-NuraWell!\n\n${intro}\n\n— דולב · Dolev NuraWell.ai`,
  };
}
