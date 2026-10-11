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
  return genderPhrase(gender, { male: 'לחץ', female: 'לחצי', neutral: 'לחצו' });
}

export function genderApproved(gender: ProfileGender): string {
  return genderPhrase(gender, { male: 'אישר', female: 'אישרה', neutral: 'אישרו' });
}

export function genderDenied(gender: ProfileGender): string {
  return genderPhrase(gender, { male: 'דחה', female: 'דחתה', neutral: 'דחו' });
}

export function genderRevoked(gender: ProfileGender): string {
  return genderPhrase(gender, { male: 'ביטל', female: 'ביטלה', neutral: 'ביטלו' });
}

export function genderGrantedGlobal(gender: ProfileGender): string {
  return genderPhrase(gender, {
    male: 'אישר גישת צוות לכל תמלילי השיחות',
    female: 'אישרה גישת צוות לכל תמלילי השיחות',
    neutral: 'אישרו גישת צוות לכל תמלילי השיחות',
  });
}
