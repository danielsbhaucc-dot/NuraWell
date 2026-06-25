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
