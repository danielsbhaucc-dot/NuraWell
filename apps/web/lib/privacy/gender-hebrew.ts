import type { OnboardingGender } from '@/lib/onboarding/types';

/** מגדר פרופיל — null/ריק = ניסוח ניטרלי עם סלאש. */
export type ProfileGender = OnboardingGender | null | undefined | '';

export function genderPhrase(
  gender: ProfileGender,
  forms: { male: string; female: string; neutral: string },
): string {
  if (gender === 'male') return forms.male;
  if (gender === 'female') return forms.female;
  return forms.neutral;
}

export function genderPress(gender: ProfileGender): string {
  return genderPhrase(gender, { male: 'לחץ', female: 'לחצי', neutral: 'לחץ/י' });
}

export function genderApproved(gender: ProfileGender): string {
  return genderPhrase(gender, { male: 'אישר', female: 'אישרה', neutral: 'אישר/ה' });
}

export function genderDenied(gender: ProfileGender): string {
  return genderPhrase(gender, { male: 'דחה', female: 'דחתה', neutral: 'דחה/תה' });
}

export function genderRevoked(gender: ProfileGender): string {
  return genderPhrase(gender, { male: 'ביטל', female: 'ביטלה', neutral: 'ביטל/ה' });
}

export function genderGrantedGlobal(gender: ProfileGender): string {
  return genderPhrase(gender, {
    male: 'אישר גישת צוות לכל תמלילי השיחות',
    female: 'אישרה גישת צוות לכל תמלילי השיחות',
    neutral: 'אישר/ה גישת צוות לכל תמלילי השיחות',
  });
}
