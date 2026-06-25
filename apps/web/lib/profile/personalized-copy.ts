export type ProfileGender = 'male' | 'female' | null;

export function firstNameFrom(fullName: string | null, fallback = 'חבר'): string {
  return fullName?.trim().split(/\s+/)[0] || fallback;
}

/** כותרת משנה בפרופיל — שפה קלילה לפי מגדר */
export function profileSubtitle(gender: ProfileGender, firstName: string): string {
  if (gender === 'female') {
    return `היי ${firstName}, זה המקום שלך - פה רואים מה אלמוג יודע עלייך, ואפשר לעדכן מתי שבא לך.`;
  }
  if (gender === 'male') {
    return `היי ${firstName}, זה המקום שלך - פה רואים מה אלמוג יודע עליך, ואפשר לעדכן מתי שבא לך.`;
  }
  return `היי ${firstName}, זה הפרופיל שלך - כל מה שחשוב לנו לדעת נמצא פה, ואפשר לעדכן בקלות.`;
}

export function profileChatCta(gender: ProfileGender): string {
  if (gender === 'female') return 'בואי נעדכן בשיחה';
  if (gender === 'male') return 'בוא נעדכן בשיחה';
  return 'עדכן בשיחה';
}

export function genderLabel(gender: ProfileGender): string {
  if (gender === 'male') return 'זכר';
  if (gender === 'female') return 'נקבה';
  return '';
}

/** "חבר מאז" / "חברה מאז" לפי מגדר הפרופיל */
export function memberSinceLabel(gender: ProfileGender, since: string): string {
  if (gender === 'female') return `חברה מאז ${since}`;
  if (gender === 'male') return `חבר מאז ${since}`;
  return `חבר/ה מאז ${since}`;
}

/** "אל תכתוב" / "אל תכתבי" לפי מגדר הפרופיל */
export function imperativeDontWrite(gender: ProfileGender): string {
  if (gender === 'female') return 'אל תכתבי';
  if (gender === 'male') return 'אל תכתוב';
  return 'אל תכתוב/י';
}

/** "תלחץ" / "תלחצי" לפי מגדר */
export function imperativeTap(gender: ProfileGender): string {
  if (gender === 'female') return 'תלחצי';
  if (gender === 'male') return 'תלחץ';
  return 'לחץ/י';
}
