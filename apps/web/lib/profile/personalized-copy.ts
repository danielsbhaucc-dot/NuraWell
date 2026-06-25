export type ProfileGender = 'male' | 'female' | null;

export function firstNameFrom(fullName: string | null, fallback = 'חבר'): string {
  return fullName?.trim().split(/\s+/)[0] || fallback;
}

/** כותרת משנה בפרופיל — שפה קלילה לפי מגדר */
export function profileSubtitle(gender: ProfileGender, firstName: string): string {
  if (gender === 'female') {
    return `היי ${firstName} — הנה מה שאלמוג יודע עלייך עד עכשיו ✦`;
  }
  if (gender === 'male') {
    return `היי ${firstName} — הנה מה שאלמוג יודע עליך עד עכשיו ✦`;
  }
  return `היי ${firstName} — ככה נראה הפרופיל שלך כרגע ✦`;
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
