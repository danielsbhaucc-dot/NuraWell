import { describe, expect, it } from 'vitest';

import {
  correctLateNightMorning,
  israelHour,
  israelLocalToUtcIso,
  israelParts,
  israelWallClockToUtcIso,
  parseIsraelLocal,
} from '../lib/ai/almog-commitments/time';

/**
 * ב-2026 ישראל ב-DST (UTC+3) בין סוף מרץ לסוף אוקטובר, אז יוני = +3.
 */
describe('almog-commitments/time', () => {
  it('israelWallClockToUtcIso מחסיר את היסט ישראל (יוני = +3)', () => {
    // 15/06/2026 00:30 שעון ישראל → 14/06 21:30 UTC.
    expect(israelWallClockToUtcIso(2026, 6, 15, 0, 30)).toBe('2026-06-14T21:30:00.000Z');
  });

  it('הבאג המקורי: 00:30 לא הופך ל-03:30', () => {
    // השעה ש*תוצג* בישראל מתוך ה-UTC חייבת לחזור להיות 00:30 (לא 03:30).
    const iso = israelWallClockToUtcIso(2026, 6, 15, 0, 30);
    const shown = israelParts(new Date(iso));
    expect(shown.hour).toBe(0);
    expect(shown.minute).toBe(30);
  });

  it('israelHour מחזיר את שעת ישראל', () => {
    // 2026-06-14T21:30:00Z = 15/06 00:30 שעון ישראל.
    expect(israelHour(new Date('2026-06-14T21:30:00Z'))).toBe(0);
  });

  it('parseIsraelLocal מפרק פורמט תקין ודוחה לא-תקין', () => {
    expect(parseIsraelLocal('2026-06-15 07:00')).toEqual({
      year: 2026,
      month: 6,
      day: 15,
      hour: 7,
      minute: 0,
    });
    expect(parseIsraelLocal('2026-06-15T07:30')).toEqual({
      year: 2026,
      month: 6,
      day: 15,
      hour: 7,
      minute: 30,
    });
    expect(parseIsraelLocal('מחר בבוקר')).toBeNull();
    expect(parseIsraelLocal('2026-13-40 99:99')).toBeNull();
  });

  it('correctLateNightMorning מתקן "מחר בבוקר" שנאמר אחרי חצות', () => {
    // עכשיו: 15/06 00:30 שעון ישראל. המודל נתן בטעות 16/06 07:00.
    const now = new Date('2026-06-14T21:30:00Z');
    const fixed = correctLateNightMorning(
      { year: 2026, month: 6, day: 16, hour: 7, minute: 0 },
      now
    );
    expect(fixed).toEqual({ year: 2026, month: 6, day: 15, hour: 7, minute: 0 });
  });

  it('correctLateNightMorning לא נוגע בשעות יום רגילות', () => {
    // עכשיו: 15/06 12:00 שעון ישראל — לא לילה, אין תיקון.
    const now = new Date('2026-06-15T09:00:00Z');
    const parts = { year: 2026, month: 6, day: 16, hour: 7, minute: 0 };
    expect(correctLateNightMorning(parts, now)).toEqual(parts);
  });

  it('correctLateNightMorning לא מתקן שעת ערב (רק בוקר)', () => {
    const now = new Date('2026-06-14T21:30:00Z'); // 00:30 IL
    const parts = { year: 2026, month: 6, day: 16, hour: 20, minute: 0 };
    expect(correctLateNightMorning(parts, now)).toEqual(parts);
  });

  it('israelLocalToUtcIso: באג #4 מקצה-לקצה (תזכורת ל-7 בבוקר ב-00:30)', () => {
    const now = new Date('2026-06-14T21:30:00Z'); // 15/06 00:30 IL
    // המודל נתן 16/06 07:00, אך הכוונה היא לבוקר הקרוב (15/06 07:00 IL = 04:00Z).
    expect(israelLocalToUtcIso('2026-06-16 07:00', now)).toBe('2026-06-15T04:00:00.000Z');
  });

  it('israelLocalToUtcIso: ביום רגיל מחזיר את התאריך כפי שהוא', () => {
    const now = new Date('2026-06-15T09:00:00Z'); // 12:00 IL
    expect(israelLocalToUtcIso('2026-06-16 07:00', now)).toBe('2026-06-16T04:00:00.000Z');
  });

  it('israelLocalToUtcIso: פורמט לא תקין → null', () => {
    expect(israelLocalToUtcIso('בערב', new Date())).toBeNull();
  });
});
