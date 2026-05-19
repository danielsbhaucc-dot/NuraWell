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

  const almogVerb = gender === 'female' ? 'תלווה' : 'ילווה';
  const intro = `${name}, שמחתי לאשר את האימייל שלך! קיבלתי את כל מה שמילאת בהרשמה — ושמרתי לך סיכום קצר כאן למטה. מכאן אלמוג ${almogVerb} אותך במסע, ואני כאן אם ${gc.wantReturn} לחזור לשאלות על ההרשמה.`;

  const supportLine = `לשאלות ותמיכה ${gc.useSupport} באפליקציה או בדף יצירת קשר.`;

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
