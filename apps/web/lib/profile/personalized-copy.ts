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
export function guidesPageTitle(): string {
  return 'המדריכים שלך';
}

export function guidesPageGreeting(firstName: string): string {
  return `היי ${firstName} 👋`;
}

export function guidesPageSubtitle(gender: ProfileGender): string {
  if (gender === 'female') return 'אני כאן איתך — בואי נמשיך בקצב שנוח לך';
  if (gender === 'male') return 'אני כאן איתך — בוא נמשיך בקצב שנוח לך';
  return 'אני כאן איתך — בוא/י נמשיך בקצב שנוח לך';
}

/** כותרת תיבת אלמוג בעמוד המדריכים — גוף ראשון */
export function guidesAlmogCoachTitle(firstName: string): string {
  return `${firstName}, אני קורא איתך את המדריכים`;
}

/** כותרת תיבת אלמוג בעמוד מדריך בודד — גוף ראשון */
export function guideDetailAlmogTitle(firstName: string): string {
  return `${firstName}, אני כאן במדריך הזה`;
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

/** כותרת תיבת אלמוג בפרק — גוף ראשון */
export function lessonAlmogCoachTitle(firstName: string): string {
  return `${firstName}, אני איתך בפרק הזה`;
}

/** CTA תיבת אלמוג בפרק */
export function lessonAlmogCta(gender: ProfileGender): string {
  if (gender === 'female') return 'דברי איתי על הפרק';
  if (gender === 'male') return 'דבר איתי על הפרק';
  return 'דבר/י איתי על הפרק';
}

/** שם מצב הלמידה האימרסיבי במדריך — במקום "מסלול לימוד" */
export const GUIDE_IMMERSIVE_MODE_LABEL = 'מסע הצלילה';

/** כותרת שער הכניסה למדריך */
export function guideCoverDivePrompt(gender: ProfileGender): string {
  if (gender === 'female') return 'בואי נצלול פנימה';
  if (gender === 'male') return 'בוא נצלול פנימה';
  return 'בואו נצלול פנימה';
}

/** שאלת בחירת מצב בשער הכניסה */
export function guideCoverModeQuestion(gender: ProfileGender): string {
  if (gender === 'female') return 'איך תרצי לחוות את המדריך?';
  if (gender === 'male') return 'איך תרצה לחוות את המדריך?';
  return 'איך תרצו לחוות את המדריך?';
}

/** רמז בתחילת מסע הצלילה */
export function guidePathIntroHint(gender: ProfileGender): string {
  if (gender === 'female') return 'גללי בין הפרקים וגלי את המסע צעד אחר צעד';
  if (gender === 'male') return 'גלול בין הפרקים וגלה את המסע צעד אחר צעד';
  return 'גללו בין הפרקים וגלו את המסע צעד אחר צעד';
}

/** כפתור חזרה לשער הכניסה */
export function guideBackToCoverLabel(): string {
  return 'חזרה לשער';
}

/** כפתור חזרה למדריך מפרק */
export function guideBackToGuideLabel(): string {
  return 'חזרה למדריך';
}

/** יציאה ממסע הפרק למצב קריאה */
export function lessonBackToReadLabel(): string {
  return 'חזרה למצב קריאה';
}

/** כותרת משנה חמה ברשימת פרקים */
export function guideChaptersSubtitle(gender: ProfileGender): string {
  if (gender === 'female') return 'כל פרק הוא צעד קטן — בקצב שנוח לך';
  if (gender === 'male') return 'כל פרק הוא צעד קטן — בקצב שנוח לך';
  return 'כל פרק הוא צעד קטן — בקצב שנוח לכם';
}

/** טקסט אלמוג בפרק — מותאם מגדר */
export function lessonAlmogCoachBody(gender: ProfileGender): string {
  if (gender === 'female') {
    return 'אפשר לשאול אותי על התוכן, לבקש סיכום פשוט, או להפוך את זה לצעד קטן שמתאים להיום.';
  }
  if (gender === 'male') {
    return 'אפשר לשאול אותי על התוכן, לבקש סיכום פשוט, או להפוך את זה לצעד קטן שמתאים להיום.';
  }
  return 'אפשר לשאול אותי על התוכן, לבקש סיכום פשוט, או להפוך את זה לצעד קטן שמתאים להיום.';
}

/** כותרת מצב אימרסיבי בפרק */
export function lessonImmersiveModeLabel(): string {
  return 'מסע הפרק';
}

/** רמז בתחילת מסע הפרק */
export function lessonPathIntroHint(gender: ProfileGender): string {
  if (gender === 'female') return 'עברי בין השקפים בקצב שנוח לך';
  if (gender === 'male') return 'עבור בין השקפים בקצב שנוח לך';
  return 'עברו בין השקפים בקצב שנוח לכם';
}

/** ברכת פתיחה בעמוד ההתקדמות */
export function progressPageGreeting(firstName: string): string {
  return `היי ${firstName} 👋`;
}

/** טקסט חם של אלמוג בגיבור עמוד ההתקדמות — משתנה לפי seed */
export function progressPageAlmogHeroBody(
  gender: ProfileGender,
  firstName: string,
  seed = 0
): string {
  const female = [
    `${firstName}, הסתכלתי על מה שעשית — ויש פה דברים ששווה לחגוג.`,
    `${firstName}, זה לא מבחן. זה סיכום קצר של הצעדים שלך, בלי רעש.`,
    `${firstName}, כל נקודה כאן היא רמז — לא שיפוט. בואי נמשיך בקצב שנוח לך.`,
    `${firstName}, אני גאה בך על ההתמדה. בואי נראה יחד מה כבר עובד.`,
  ];
  const male = [
    `${firstName}, הסתכלתי על מה שעשית — ויש פה דברים ששווה לחגוג.`,
    `${firstName}, זה לא מבחן. זה סיכום קצר של הצעדים שלך, בלי רעש.`,
    `${firstName}, כל נקודה כאן היא רמז — לא שיפוט. בוא נמשיך בקצב שנוח לך.`,
    `${firstName}, אני גאה בך על ההתמדה. בוא נראה יחד מה כבר עובד.`,
  ];
  const neutral = [
    `${firstName}, הסתכלתי על מה שעשית — ויש פה דברים ששווה לחגוג.`,
    `${firstName}, זה לא מבחן. זה סיכום קצר של הצעדים שלך, בלי רעש.`,
    `${firstName}, כל נקודה כאן היא רמז — לא שיפוט. בוא/י נמשיך בקצב שנוח.`,
    `${firstName}, אני גאה/ה בך על ההתמדה. בוא/י נראה יחד מה כבר עובד.`,
  ];
  const pool = gender === 'female' ? female : gender === 'male' ? male : neutral;
  return pool[Math.abs(seed) % pool.length]!;
}

/** כותרת משנה לסקשן סטטיסטיקות */
export function progressStatsSectionSubtitle(gender: ProfileGender): string {
  if (gender === 'female') return 'המספרים שלך — בקצרה ובבהירות';
  if (gender === 'male') return 'המספרים שלך — בקצרה ובבהירות';
  return 'המספרים שלך — בקצרה ובבהירות';
}

/** הודעה דינמית על ימים עם ביצוע חלקי */
export function progressPartialDaysMessage(count: number): string {
  if (count <= 0) return '';
  if (count === 1) {
    return 'יום אחד עם ביצוע חלקי — גם ניסיון חשוב, וכל צעד קטן נספר.';
  }
  if (count === 2) {
    return 'שני ימים עם התקדמות חלקית — זה בדיוק איך הרגלים נבנים, לא בקפיצה אחת.';
  }
  if (count <= 5) {
    return `${count} ימים עם ביצוע חלקי — כל צעד קטן מצטבר למשהו גדול יותר.`;
  }
  return `${count} ימים עם התקדמות חלקית — את/ה לא מוותר/ת, וזה מה שבאמת משנה.`;
}
