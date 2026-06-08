import { describe, it, expect } from 'vitest';
import { normalizeHebrewDashes, HEBREW_MAQAF } from '../lib/text/hebrew-dashes';

describe('normalizeHebrewDashes', () => {
  it('מקף מחבר אות+ספרה → מקף עברי', () => {
    expect(normalizeHebrewDashes('כ-5 דקות')).toBe(`כ${HEBREW_MAQAF}5 דקות`);
  });

  it('מקף מחבר בין מילים עבריות → מקף עברי', () => {
    expect(normalizeHebrewDashes('בן-אדם')).toBe(`בן${HEBREW_MAQAF}אדם`);
  });

  it('מקף ארוך כמפריד משפט → פסיק', () => {
    expect(normalizeHebrewDashes('היית בפעולה — זה מצוין')).toBe('היית בפעולה, זה מצוין');
  });

  it('לא משאיר מקף ארוך בכלל', () => {
    expect(normalizeHebrewDashes('אלמוג — המנטור שלך')).not.toContain('—');
  });

  it('טווח מספרים עם מקף ארוך → מקף עברי בין הספרות', () => {
    expect(normalizeHebrewDashes('5–7 ימים')).toBe(`5${HEBREW_MAQAF}7 ימים`);
  });

  it('מקף ארוך בקצה לא משאיר פסיק תלוי', () => {
    expect(normalizeHebrewDashes('— ספר לי')).toBe('ספר לי');
  });

  it('מחרוזת ריקה/null בטוחה', () => {
    expect(normalizeHebrewDashes('')).toBe('');
    expect(normalizeHebrewDashes(null)).toBe('');
    expect(normalizeHebrewDashes(undefined)).toBe('');
  });
});
