import { describe, it, expect } from 'vitest';
import {
  hebrewPlural,
  hebrewPluralCategory,
  hebrewDaysLabel,
  hebrewActiveGuidesLabel,
  hebrewMinutesLabel,
  sumLessonDurationMinutes,
} from '../lib/text/hebrew-plural';

describe('hebrewPluralCategory', () => {
  it('מסווג לפי CLDR עברית (one/two/other + zero מקומי)', () => {
    expect(hebrewPluralCategory(0)).toBe('zero');
    expect(hebrewPluralCategory(1)).toBe('one');
    expect(hebrewPluralCategory(2)).toBe('two');
    // ב-ICU הנוכחי עברית משתמשת ב-other ל-3+ (לא few/many)
    expect(hebrewPluralCategory(5)).toBe('other');
  });
});

describe('hebrewPlural', () => {
  it('מחליף {n} ובוחר one/other', () => {
    const forms = { one: 'פריט אחד', other: '{n} פריטים' };
    expect(hebrewPlural(1, forms)).toBe('פריט אחד');
    expect(hebrewPlural(4, forms)).toBe('4 פריטים');
  });

  it('משתמש ב-zero כשמוגדר', () => {
    expect(
      hebrewPlural(0, { zero: 'אין פריטים', one: 'פריט אחד', other: '{n} פריטים' })
    ).toBe('אין פריטים');
  });
});

describe('hebrewDaysLabel', () => {
  it('מוסיף רווח וצורות תקניות', () => {
    expect(hebrewDaysLabel(0)).toBe('0 ימים');
    expect(hebrewDaysLabel(1)).toBe('יום אחד');
    expect(hebrewDaysLabel(2)).toBe('יומיים');
    expect(hebrewDaysLabel(7)).toBe('7 ימים');
  });
});

describe('hebrewActiveGuidesLabel', () => {
  it('יחיד לרבים לפי מונה', () => {
    expect(hebrewActiveGuidesLabel(0)).toBe('אין מדריכים פעילים');
    expect(hebrewActiveGuidesLabel(1)).toBe('מדריך פעיל אחד');
    expect(hebrewActiveGuidesLabel(3)).toBe('3 מדריכים פעילים');
  });
});

describe('hebrewMinutesLabel + sumLessonDurationMinutes', () => {
  it('מחשב סכום פרקים עם fallback רק לחסרים', () => {
    expect(
      sumLessonDurationMinutes([
        { duration_minutes: 30 },
        { duration_minutes: 45 },
        { duration_minutes: null },
      ])
    ).toBe(90);
  });

  it('תווית דקות משוערת', () => {
    expect(hebrewMinutesLabel(195, { approx: true })).toBe('כ־195 דקות');
    expect(hebrewMinutesLabel(1)).toBe('דקה אחת');
  });
});
