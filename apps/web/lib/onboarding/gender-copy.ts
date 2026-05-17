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
};

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
    };
  }
  return {
    you: 'את/ה',
    your: 'שלך',
    choose: 'בחר/י',
    enter: 'הזן/י',
    tell: 'ספר/י',
    ready: 'מוכן/ה',
    welcome: 'ברוך/ה הבא/ה',
    come: 'בוא/י',
    have: 'יש לך',
    recommend: 'ממליץ/ה',
    hurry: 'ממהר/ת',
    missMeals: 'מפספס/ת ארוחות',
    eatOut: 'אוכל/ת בחוץ / משלוחים',
    tired: 'עייפות אחרי העבודה',
    snack: 'נשנושים מול מסך',
  };
}
