import type { OnboardingGender } from './types';

export type GenderCopy = {
  you: string;
  your: string;
  choose: string;
  enter: string;
  tell: string;
  ready: string;
  welcome: string;
  come: string;
  have: string;
  recommend: string;
  hurry: string;
  missMeals: string;
  eatOut: string;
  tired: string;
  snack: string;
  glance: string;
  press: string;
  fill: string;
  detail: string;
  needHelp: string;
  willReceive: string;
  checkSpam: string;
  wantReturn: string;
  useSupport: string;
  sendsYouEmail: string;
  willShowYou: string;
};

/** תווית תפקיד דולב בהרשמה — לא «מנטור» (שייך לאלמוג) */
export const DOLEV_REGISTRATION_ROLE = 'מנהל ההרשמה';

export type CommitmentCopy = {
  /** פתיח מותאם מגדר: "אני מתחייב" / "אני מתחייבת" / "אני מתחייב/ת" */
  prefix: string;
  /** טקסט כפתור הקבלה המותאם מגדר */
  button: string;
};

/**
 * נוסח התחייבות מותאם מגדר לפי הפרופיל. כשהמגדר לא ידוע — נוסח ניטרלי בלי סלאשים.
 */
export function commitmentCopy(
  gender: OnboardingGender | '' | null | undefined
): CommitmentCopy {
  if (gender === 'male') {
    return { prefix: 'אני מתחייב', button: 'אני מתחייב וממשיך' };
  }
  if (gender === 'female') {
    return { prefix: 'אני מתחייבת', button: 'אני מתחייבת וממשיכה' };
  }
  return { prefix: 'ההתחייבות שלי', button: 'מתחייבים וממשיכים' };
}

export function genderCopy(gender: OnboardingGender | ''): GenderCopy {
  if (gender === 'male') {
    return {
      you: 'אתה',
      your: 'שלך',
      choose: 'בחר',
      enter: 'הזן',
      tell: 'ספר',
      ready: 'מוכן',
      welcome: 'ברוך הבא',
      come: 'בוא',
      have: 'יש לך',
      recommend: 'ממליץ',
      hurry: 'ממהר',
      missMeals: 'מפספס ארוחות',
      eatOut: 'אוכל בחוץ / משלוחים',
      tired: 'עייפות אחרי העבודה',
      snack: 'נשנושים מול מסך',
      glance: 'תעיף',
      press: 'לחץ',
      fill: 'מלא',
      detail: 'פרט',
      needHelp: 'תצטרך',
      willReceive: 'תקבל',
      checkSpam: 'בדוק',
      wantReturn: 'תרצה',
      useSupport: 'השתמש',
      sendsYouEmail: 'דולב שולח אליך עכשיו מייל',
      willShowYou: 'יציג לך',
    };
  }
  if (gender === 'female') {
    return {
      you: 'את',
      your: 'שלך',
      choose: 'בחרי',
      enter: 'הזיני',
      tell: 'ספרי',
      ready: 'מוכנה',
      welcome: 'ברוכה הבאה',
      come: 'בואי',
      have: 'יש לך',
      recommend: 'ממליצה',
      hurry: 'ממהרת',
      missMeals: 'מפספסת ארוחות',
      eatOut: 'אוכלת בחוץ / משלוחים',
      tired: 'עייפות אחרי העבודה',
      snack: 'נשנושים מול מסך',
      glance: 'תעיפי',
      press: 'לחצי',
      fill: 'מלאי',
      detail: 'פרטי',
      needHelp: 'תצטרכי',
      willReceive: 'תקבלי',
      checkSpam: 'בדקי',
      wantReturn: 'תרצי',
      useSupport: 'השתמשי',
      sendsYouEmail: 'דולב שולח אלייך עכשיו מייל',
      willShowYou: 'יציג לך',
    };
  }
  // neutral (gender unknown): plural/impersonal Hebrew — no slash forms
  return {
    you: 'אתם',
    your: 'שלכם',
    choose: 'בחרו',
    enter: 'הזינו',
    tell: 'ספרו',
    ready: 'מוכנים',
    welcome: 'ברוכים הבאים',
    come: 'בואו',
    have: 'יש לכם',
    recommend: 'ממליצים',
    hurry: 'ממהרים',
    missMeals: 'מפספסים ארוחות',
    eatOut: 'אוכלים בחוץ / משלוחים',
    tired: 'עייפות אחרי העבודה',
    snack: 'נשנושים מול מסך',
    glance: 'תעיפו',
    press: 'לחצו',
    fill: 'מלאו',
    detail: 'פרטו',
    needHelp: 'תצטרכו',
    willReceive: 'תקבלו',
    checkSpam: 'בדקו',
    wantReturn: 'תרצו',
    useSupport: 'השתמשו',
    sendsYouEmail: 'דולב שולח עכשיו מייל',
    willShowYou: 'יציג',
  };
}
