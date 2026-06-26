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

/** כותרת עמוד המדריכים */
export function guidesPageTitle(gender: ProfileGender, firstName: string): string {
  return `היי ${firstName}`;
}

export function guidesPageSubtitle(gender: ProfileGender): string {
  if (gender === 'female') return 'המדריכים שלך — בואי נמשיך בקצב שנוח לך';
  if (gender === 'male') return 'המדריכים שלך — בוא נמשיך בקצב שנוח לך';
  return 'המדריכים שלך — בוא/י נמשיך בקצב שנוח לך';
}

/** טקסט אלמוג בעמוד המדריכים — גוף ראשון */
export function guidesAlmogCoachBody(
  gender: ProfileGender,
  firstName: string,
  almogNote?: string | null
): string {
  if (almogNote?.trim()) return almogNote.trim();
  if (gender === 'female') {
    return `${firstName}, הסתכלתי על ההתקדמות שלך. אם לא בטוחה במה להמשיך — אני כאן לבחור איתך את הפרק או המדריך שהכי מתאים לרגע הזה.`;
  }
  if (gender === 'male') {
    return `${firstName}, הסתכלתי על ההתקדמות שלך. אם לא בטוח במה להמשיך — אני כאן לבחור איתך את הפרק או המדריך שהכי מתאים לרגע הזה.`;
  }
  return `${firstName}, הסתכלתי על ההתקדמות שלך. אם לא בטוח/ה במה להמשיך — אני כאן לבחור איתך את הפרק או המדריך שהכי מתאים לרגע הזה.`;
}

/** טקסט אלמוג בעמוד מדריך בודד */
export function guideDetailAlmogBody(
  gender: ProfileGender,
  firstName: string,
  courseTitle: string,
  almogNote?: string | null
): string {
  if (almogNote?.trim()) return almogNote.trim();
  if (gender === 'female') {
    return `${firstName}, לפני שממשיכים ב"${courseTitle}" — בואי נעצור רגע: מה חשוב לקחת מכאן, איפה להתחיל, ואיך לחבר את זה להרגלים שלך.`;
  }
  if (gender === 'male') {
    return `${firstName}, לפני שממשיכים ב"${courseTitle}" — בוא נעצור רגע: מה חשוב לקחת מכאן, איפה להתחיל, ואיך לחבר את זה להרגלים שלך.`;
  }
  return `${firstName}, לפני שממשיכים ב"${courseTitle}" — בוא/י נעצור רגע: מה חשוב לקחת מכאן, איפה להתחיל, ואיך לחבר את זה להרגלים שלך.`;
}

/** CTA "התחל ללמוד" / "המשך ללמוד" */
export function guideLearnCta(gender: ProfileGender, isStart: boolean): string {
  if (isStart) {
    if (gender === 'female') return 'התחילי ללמוד';
    if (gender === 'male') return 'התחל ללמוד';
    return 'התחל/י ללמוד';
  }
  if (gender === 'female') return 'המשיכי ללמוד';
  if (gender === 'male') return 'המשך ללמוד';
  return 'המשך/י ללמוד';
}

/** באנר "בוא נמשיך ללמוד" */
export function guidesContinueBanner(gender: ProfileGender): { title: string; subtitle: string } {
  if (gender === 'female') {
    return { title: '⚡ בואי נמשיך ללמוד!', subtitle: 'יש פרקים שמחכים לך' };
  }
  if (gender === 'male') {
    return { title: '⚡ בוא נמשיך ללמוד!', subtitle: 'יש פרקים שמחכים לך' };
  }
  return { title: '⚡ בוא/י נמשיך ללמוד!', subtitle: 'יש פרקים שמחכים לך' };
}
