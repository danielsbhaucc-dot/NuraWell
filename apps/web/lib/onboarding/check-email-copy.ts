import type { OnboardingGender } from './types';
import { genderCopy } from './gender-copy';

export type CheckEmailCopy = {
  title: string;
  lead: string;
  autoHint: string;
  codePrompt: string;
  verifyButton: string;
  resend: string;
  resending: string;
  alreadyVerified: string;
};

export function checkEmailCopy(
  gender: OnboardingGender | '' | null,
  firstName: string
): CheckEmailCopy {
  const gc = genderCopy(gender ?? '');
  const hi = firstName.trim() ? `${firstName.trim()}, ` : '';

  if (gender === 'male') {
    return {
      title: `${hi}בדוק את תיבת האימייל`,
      lead: `שלחנו לך קישור לאימות. אחרי האישור תועבר לדף האימות — ודולב ישלח לך ברכה עם סיכום מה שמילאת.`,
      autoHint: 'המסך יתעדכן אוטומטית ברגע שתאשר את המייל (גם אם נשארת כאן).',
      codePrompt: 'או הזן את קוד האימות מהמייל',
      verifyButton: 'אימות עם קוד',
      resend: 'שלח לי שוב את מייל האימות',
      resending: 'שולחים...',
      alreadyVerified: 'כבר אימתת?',
    };
  }

  if (gender === 'female') {
    return {
      title: `${hi}בדקי את תיבת האימייל`,
      lead: `שלחנו לך קישור לאימות. אחרי האישור תועברי לדף האימות — ודולב ישלח לך ברכה עם סיכום מה שמילאת.`,
      autoHint: 'המסך יתעדכן אוטומטית ברגע שתאשרי את המייל (גם אם נשארת כאן).',
      codePrompt: 'או הזיני את קוד האימות מהמייל',
      verifyButton: 'אימות עם קוד',
      resend: 'שלחי לי שוב את מייל האימות',
      resending: 'שולחים...',
      alreadyVerified: 'כבר אימתת?',
    };
  }

  return {
    title: `${hi}בדוק/י את תיבת האימייל`,
    lead: `שלחנו לך/לך קישור לאימות. אחרי האישור תועבר/י לדף האימות — ודולב ישלח ברכה עם סיכום מה שמילאת.`,
    autoHint: 'המסך יתעדכן אוטומטית ברגע שתאשר/י את המייל (גם אם נשארת כאן).',
    codePrompt: 'או הזן/י את קוד האימות מהמייל',
    verifyButton: 'אימות עם קוד',
    resend: 'שלחו לי שוב את מייל האימות',
    resending: 'שולחים...',
    alreadyVerified: 'כבר אימתת?',
  };
}
