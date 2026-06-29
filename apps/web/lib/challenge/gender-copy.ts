export type GenderCopy = 'male' | 'female' | 'neutral';

export function genderFromProfile(gender: string | null | undefined): GenderCopy {
  if (gender === 'male') return 'male';
  if (gender === 'female') return 'female';
  return 'neutral';
}

export function firstNameFromFullName(fullName: string | null | undefined): string {
  const t = fullName?.trim();
  if (!t) return 'חבר/ה';
  return t.split(/\s+/)[0] ?? 'חבר/ה';
}

/** פנייה מותאמת מין */
export function addressUser(firstName: string, gender: GenderCopy): string {
  if (gender === 'male') return `${firstName}, אחי`;
  if (gender === 'female') return `${firstName}, אחותי`;
  return firstName;
}

export function excitedAlmogLine(firstName: string, gender: GenderCopy): string {
  const addr = addressUser(firstName, gender);
  if (gender === 'male') {
    return `${addr}! אני כל כך נרגש להתחיל איתך את האתגר הזה.`;
  }
  if (gender === 'female') {
    return `${addr}! אני ממש מתרגשת להתחיל איתך את האתגר הזה.`;
  }
  return `${firstName}! אני ממש מתרגש/ת להתחיל איתך את האתגר הזה.`;
}

export function waitingHeadline(firstName: string, gender: GenderCopy): string {
  if (gender === 'male') return `${firstName}, האתגר שלך מתקרב`;
  if (gender === 'female') return `${firstName}, האתגר שלך מתקרב`;
  return `${firstName}, האתגר מתקרב`;
}

export function challengeIntroLine(firstName: string, gender: GenderCopy): string {
  if (gender === 'male') {
    return `היי ${firstName}, נעים להכיר — אני אלמוג! ב-14 הימים הקרובים אני איתך צעד-צעד.`;
  }
  if (gender === 'female') {
    return `היי ${firstName}, נעים להכיר — אני אלמוג! ב-14 הימים הקרובים אני איתך צעד-צעד.`;
  }
  return `היי ${firstName}, נעים להכיר — אני אלמוג! ב-14 הימים הקרובים אני איתך צעד-צעד.`;
}
