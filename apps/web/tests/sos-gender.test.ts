import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { fixSecondPersonPronoun } from '../lib/ai/almog-commitments/intervention-engine';

describe('SOS pronoun guard', () => {
  it('female: אתה → את; other words untouched', () => {
    expect(fixSecondPersonPronoun('אבל אתה רוצה. "אתה" ואתהלך', 'female')).toBe('אבל את רוצה. "את" ואתהלך');
  });
  it('male/unknown untouched', () => {
    expect(fixSecondPersonPronoun('אתה רוצה', 'male')).toBe('אתה רוצה');
    expect(fixSecondPersonPronoun('אתה רוצה', null)).toBe('אתה רוצה');
  });
});
