import { describe, expect, it } from 'vitest';
import {
  companionIntervalForLife,
  getAlmogPushTier,
  parseLifeContextFromMessage,
} from '../lib/ai/life-context';

describe('parseLifeContextFromMessage', () => {
  const now = new Date('2026-05-19T10:00:00+03:00');

  it('מזהה חופשה ביום חמישי', () => {
    const lc = parseLifeContextFromMessage('היי אני בחופשה ביום חמישי', now);
    expect(lc?.profile).toBe('away');
    expect(lc?.push_level).toBe('light');
    expect(lc?.contextual_check_at).toBeTruthy();
  });

  it('מזהה אשפוז שבוע', () => {
    const lc = parseLifeContextFromMessage('אני בבית חולים שבוע', now);
    expect(lc?.profile).toBe('pause');
    expect(lc?.push_level).toBe('minimal');
  });

  it('מזהה מחלה (לא רק אשפוז)', () => {
    const lc = parseLifeContextFromMessage('אני חולה השבוע לא בכושר', now);
    expect(lc?.kind).toBe('sick');
    expect(lc?.push_level).toBe('minimal');
  });

  it('מזהה חתונה', () => {
    const lc = parseLifeContextFromMessage('אני בחתונה של אחותי בסוף השבוע', now);
    expect(lc?.profile).toBe('away');
    expect(lc?.push_level).toBe('light');
  });

  it('מזהה מילואים', () => {
    const lc = parseLifeContextFromMessage('נכנסתי למילואים לשבוע', now);
    expect(lc?.profile).toBe('busy');
  });

  it('גיבוי גנרי לאירוע לא מוכר מראש', () => {
    const lc = parseLifeContextFromMessage('אני בשבוע קשה בעבודה אין לי ראש', now);
    expect(lc).toBeTruthy();
    expect(lc?.summary.length).toBeGreaterThan(5);
  });

  it('מזהה אילת', () => {
    const lc = parseLifeContextFromMessage('יוצא לחופשה באילת', now);
    expect(lc?.place).toMatch(/אילת/i);
  });
});

describe('getAlmogPushTier', () => {
  it('מפחית דחיפה במצב pause', () => {
    expect(
      getAlmogPushTier({
        life_context: {
          kind: 'sick',
          profile: 'pause',
          summary: 'מחלה',
          push_level: 'minimal',
        },
      })
    ).toBe('minimal');
  });

  it('חופשה = light', () => {
    expect(
      companionIntervalForLife({
        life_context: {
          kind: 'vacation',
          profile: 'away',
          summary: 'חופשה',
          push_level: 'light',
        },
      })
    ).toBe(2);
  });
});
