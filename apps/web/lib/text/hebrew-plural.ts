/**
 * hebrew-plural.ts
 * ----------------
 * ריבוי עברי מבוסס Intl.PluralRules — במקום שרשור מספר+מילה נאיבי.
 *
 * קטגוריות בעברית (CLDR):
 *   one  — 1
 *   two  — 2
 *   few  — 3–10
 *   many — 11–19, 21–… (מספרים שמסתיימים ב־11–19 בטווח מסוים)
 *   other — 0, 20, 30, …
 */

export type HebrewPluralCategory = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';

export type HebrewPluralForms = {
  /** אופציונלי — אם חסר, נופל ל-other */
  zero?: string;
  one: string;
  two?: string;
  few?: string;
  many?: string;
  other: string;
};

const hePluralRules = new Intl.PluralRules('he');

/** מחזיר את קטגוריית הריבוי העברית למספר נתון. */
export function hebrewPluralCategory(count: number): Exclude<HebrewPluralCategory, 'zero'> | 'zero' {
  const n = Math.abs(Math.trunc(Number.isFinite(count) ? count : 0));
  if (n === 0) return 'zero';
  return hePluralRules.select(n) as Exclude<HebrewPluralCategory, 'zero'>;
}

/**
 * בוחר את הצורה המתאימה לפי המספר.
 * התבניות יכולות לכלול `{n}` שיוחלף במספר.
 *
 * דוגמה:
 *   hebrewPlural(1, { one: 'מדריך פעיל אחד', other: '{n} מדריכים פעילים' })
 *   → "מדריך פעיל אחד"
 */
export function hebrewPlural(count: number, forms: HebrewPluralForms): string {
  const n = Math.trunc(Number.isFinite(count) ? count : 0);
  const abs = Math.abs(n);
  const category = hebrewPluralCategory(abs);

  let template: string;
  switch (category) {
    case 'zero':
      template = forms.zero ?? forms.other;
      break;
    case 'one':
      template = forms.one;
      break;
    case 'two':
      template = forms.two ?? forms.other;
      break;
    case 'few':
      template = forms.few ?? forms.other;
      break;
    case 'many':
      template = forms.many ?? forms.other;
      break;
    default:
      template = forms.other;
  }

  return template.replace(/\{n\}/g, String(n));
}

/** ימים: 0 ימים / יום אחד / יומיים / N ימים */
export function hebrewDaysLabel(count: number): string {
  return hebrewPlural(count, {
    zero: '0 ימים',
    one: 'יום אחד',
    two: 'יומיים',
    other: '{n} ימים',
  });
}

/** מדריכים פעילים — לפי מונה */
export function hebrewActiveGuidesLabel(count: number): string {
  return hebrewPlural(count, {
    zero: 'אין מדריכים פעילים',
    one: 'מדריך פעיל אחד',
    two: '2 מדריכים פעילים',
    other: '{n} מדריכים פעילים',
  });
}

/** דקות משוערות: דקה אחת / N דקות */
export function hebrewMinutesLabel(count: number, opts?: { approx?: boolean }): string {
  const prefix = opts?.approx ? 'כ־' : '';
  const body = hebrewPlural(count, {
    zero: '0 דקות',
    one: 'דקה אחת',
    two: '2 דקות',
    other: '{n} דקות',
  });
  return `${prefix}${body}`;
}

/**
 * סכום משך פרקים בדקות.
 * פרק בלי duration_minutes מקבל fallback (ברירת מחדל 15) — רק כשחסר ערך.
 */
export function sumLessonDurationMinutes(
  lessons: Array<{ duration_minutes?: number | null }>,
  fallbackPerLesson = 15
): number {
  return lessons.reduce((sum, lesson) => {
    const mins = lesson.duration_minutes;
    if (typeof mins === 'number' && Number.isFinite(mins) && mins >= 0) {
      return sum + mins;
    }
    return sum + fallbackPerLesson;
  }, 0);
}
