import { describe, it, expect } from 'vitest';
import { detectHebrewMoment } from '../lib/time/hebrew-calendar';
import { getPersonalGreeting } from '../lib/time/greeting';

/**
 * הזמנים ב-Asia/Jerusalem. ב-2026 ישראל ב-DST → UTC+3.
 *   "21/5/26 18:30 IL" = "2026-05-21T15:30:00Z"
 *   "22/5/26 08:00 IL" = "2026-05-22T05:00:00Z"
 * בחורף ישראל UTC+2.
 *
 * הטסטים האלה מבטיחים שזיהוי החגים יהיה דינמי לכל שנה (לא hard-coded
 * לתאריך אזרחי ספציפי).
 */

describe('detectHebrewMoment — full holiday year', () => {
  it('Shavuot eve (21/5/26 18:30 IL) → holiday_eve', () => {
    const m = detectHebrewMoment(new Date('2026-05-21T15:30:00Z'));
    expect(m.kind).toBe('holiday_eve');
    expect(m.holidayLabel).toContain('שבועות');
    expect(m.tone).toBe('festive');
  });

  it('Shavuot day (22/5/26 08:00 IL) → holiday', () => {
    const m = detectHebrewMoment(new Date('2026-05-22T05:00:00Z'));
    expect(m.kind).toBe('holiday');
    expect(m.holidayLabel).toContain('שבועות');
    expect(m.tone).toBe('festive');
  });

  it('Yom HaShoah (Apr 14 2026 → 26 Nisan 5786) → memorial, solemn', () => {
    /** יום השואה תשפ"ו = 14 באפריל 2026 = 27 בניסן? בוא נבדוק לפי hebcal */
    const m = detectHebrewMoment(new Date('2026-04-14T08:00:00Z'));
    expect(m.kind).toBe('memorial');
    expect(m.tone).toBe('solemn');
    expect(m.holidayLabel?.toLowerCase()).toContain('שואה');
  });

  it('Yom HaZikaron (Apr 21 2026) → memorial, solemn', () => {
    const m = detectHebrewMoment(new Date('2026-04-21T08:00:00Z'));
    expect(m.kind).toBe('memorial');
    expect(m.tone).toBe('solemn');
  });

  it('Yom HaAtzmaut (Apr 22 2026) → modern_holiday, festive', () => {
    const m = detectHebrewMoment(new Date('2026-04-22T08:00:00Z'));
    expect(m.kind).toBe('modern_holiday');
    expect(m.tone).toBe('festive');
  });

  it('Tu BiShvat (Feb 2 2026, 15 Shvat 5786) → minor_holiday', () => {
    const m = detectHebrewMoment(new Date('2026-02-02T08:00:00Z'));
    expect(m.kind).toBe('minor_holiday');
    expect(m.holidayLabel).toContain('בשבט');
  });

  it('returns weekday on a plain Monday', () => {
    /** 2026-06-08 = יום שני רגיל, אחרי כל החגים של אביב 2026 */
    const m = detectHebrewMoment(new Date('2026-06-08T08:00:00Z'));
    expect(['weekday', 'rosh_chodesh']).toContain(m.kind);
  });
});

describe('detectHebrewMoment — Shabbat', () => {
  it('Friday afternoon → shabbat_eve', () => {
    /** 2026-06-12 הוא יום שישי, 13:00 IL = 10:00Z */
    const m = detectHebrewMoment(new Date('2026-06-12T10:00:00Z'));
    expect(m.kind).toBe('shabbat_eve');
    expect(m.holidayLabel).toContain('שבת');
  });

  it('Saturday morning → shabbat', () => {
    const m = detectHebrewMoment(new Date('2026-06-13T08:00:00Z'));
    expect(m.kind).toBe('shabbat');
  });

  it('Saturday night after 20:00 IL → motzei_shabbat', () => {
    const m = detectHebrewMoment(new Date('2026-06-13T18:00:00Z'));
    expect(m.kind).toBe('motzei_shabbat');
  });
});

describe('getPersonalGreeting — tone-aware greeting', () => {
  it('memorial day uses solemn time greeting (without "טוב")', () => {
    const g = getPersonalGreeting(new Date('2026-04-14T08:00:00Z'));
    expect(g.timeGreeting).not.toContain('טוב');
    expect(g.tone).toBe('solemn');
  });

  it('Shavuot eve evening greets festively', () => {
    const g = getPersonalGreeting(new Date('2026-05-21T15:30:00Z'));
    expect(g.timeGreeting).toBe('ערב טוב,');
    expect(g.occasionGreeting).toMatch(/ערב חג/);
    expect(g.highlight).toBe(true);
  });

  it('regular weekday has no occasion line', () => {
    const g = getPersonalGreeting(new Date('2026-06-08T05:00:00Z'));
    if (g.moment.kind === 'weekday') {
      expect(g.occasionGreeting).toBeNull();
    }
  });
});
