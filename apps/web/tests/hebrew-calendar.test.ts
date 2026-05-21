import { describe, it, expect } from 'vitest';
import { detectHebrewMoment } from '../lib/time/hebrew-calendar';
import { getPersonalGreeting } from '../lib/time/greeting';

/**
 * הערה — Date(ISO) ב-Node מתפרש כ-UTC. כדי להתמקד בשעה ספציפית
 * ב-Asia/Jerusalem בקיץ (UTC+3) צריך להחסיר 3 שעות מהזמן הישראלי.
 *
 * דוגמאות:
 *   "ערב שבועות 21/5/26 18:30 שעון ישראל" → ISO 2026-05-21T15:30:00Z
 *   "חג שבועות 22/5/26 09:00 שעון ישראל" → ISO 2026-05-22T06:00:00Z
 *   "מוצאי חג שבועות 23/5/26 02:00 שעון ישראל" → ISO 2026-05-22T23:00:00Z
 */

describe('detectHebrewMoment', () => {
  it('detects Shavuot eve (ה׳ סיון 18:30 IL) as holiday_eve', () => {
    const m = detectHebrewMoment(new Date('2026-05-21T15:30:00Z'));
    expect(m.kind).toBe('holiday_eve');
    expect(m.holidayLabel).toContain('שבועות');
  });

  it('still returns weekday on Shavuot eve before 16:30 IL', () => {
    const m = detectHebrewMoment(new Date('2026-05-21T10:00:00Z'));
    expect(m.kind).toBe('weekday');
  });

  it('detects Shavuot day itself (ו׳ סיון 08:00 IL) as holiday', () => {
    /** 22/5/26 = ו׳ סיון = חג שבועות. 08:00 IL זה לפני 12:00 כך שלא נופלים לערב שבת. */
    const m = detectHebrewMoment(new Date('2026-05-22T05:00:00Z'));
    expect(m.kind).toBe('holiday');
    expect(m.holidayLabel).toBe('חג שבועות שמח');
  });
});

describe('getPersonalGreeting', () => {
  it('combines evening greeting with holiday eve label', () => {
    const g = getPersonalGreeting(new Date('2026-05-21T15:30:00Z'));
    expect(g.timeGreeting).toBe('ערב טוב,');
    expect(g.occasionGreeting).toMatch(/ערב חג/);
    expect(g.occasionGreeting).toMatch(/שבועות/);
    expect(g.highlight).toBe(true);
  });

  it('combines morning greeting with Shavuot label on the day itself', () => {
    const g = getPersonalGreeting(new Date('2026-05-22T06:30:00Z'));
    expect(g.timeGreeting).toBe('בוקר טוב,');
    expect(g.occasionGreeting).toBe('חג שבועות שמח');
  });
});
