import type { OnboardingGender } from '@/lib/onboarding/types';

/** בוחר נוסח לפי מגדר; כשלא ידוע: נוסח רבים/ניטרלי */
export function byGender(gender: OnboardingGender | '' | null | undefined, male: string, female: string, neutral: string): string {
  if (gender === 'male') return male;
  if (gender === 'female') return female;
  return neutral;
}

export type WelcomeEmailCopy = {
  subject: string;
  preheader: string;
  headline: string;
  subheading: string;
  intro: string;
  summaryTitle: string;
  closing: string;
  cta: string;
  signature: string;
  textPlain: string;
};

/** מייל ברוכים הבאים מדולב (אחרי אישור המייל). בלי הומור על גוף/משקל/בריאות. */
export function welcomeEmailCopy(
  firstName: string,
  gender: OnboardingGender | null | undefined
): WelcomeEmailCopy {
  const name = firstName.trim() || 'היי';
  const g = (m: string, f: string, n: string) => byGender(gender, m, f, n);

  const intro = `${name}, ${g('אתה', 'את', 'אתם')} רשמית בפנים! 🎉 אני דולב, זה שעבר על כל מה ש${g('מילאת', 'מילאת', 'מילאתם')} בהרשמה (כן, קראתי הכל, גם את החלק עם שעות השינה). שמרתי לך כאן סיכום קטן, שיהיה לך בצד.`;
  const closing = `מכאן אני מעביר את המקל לאלמוג, שי${g('לווה אותך', 'לווה אותך', 'לווה אתכם')} מעכשיו, בקצב ${g('שלך', 'שלך', 'שלכם')}, בלי לחץ ובלי שיפוט. אני מבטיח שהוא נחמד יותר ממני. טוב, כמעט 😉`;

  return {
    subject: `${name}, ${g('ברוך הבא', 'ברוכה הבאה', 'ברוכים הבאים')} ל-NuraWell 🌿`,
    preheader: `שמרתי לך סיכום של ההרשמה, ויש פה גם מישהו ש${g('כדאי לך', 'כדאי לך', 'כדאי לכם')} להכיר`,
    headline: `${name}, ${g('ברוך הבא', 'ברוכה הבאה', 'ברוכים הבאים')}! 🌿`,
    subheading: 'המסע מתחיל ממש עכשיו',
    intro,
    summaryTitle: 'מה ששמרתי עליך',
    closing,
    cta: g('יאללה, לאפליקציה', 'יאללה, לאפליקציה', 'יאללה, לאפליקציה'),
    signature: `מכאן אלמוג לוקח ${g('אותך', 'אותך', 'אתכם')}. אני? חוזר לקרוא טפסים 📋`,
    textPlain: `${name}, ${g('ברוך הבא', 'ברוכה הבאה', 'ברוכים הבאים')} ל-NuraWell!\n\n${intro}\n\n${closing}\n\nדולב · NuraWell`,
  };
}
