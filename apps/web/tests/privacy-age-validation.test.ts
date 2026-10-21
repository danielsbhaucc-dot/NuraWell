import { describe, expect, it } from 'vitest';
import { calculateAge, validateBirthDate } from '../lib/privacy/age-validation';

describe('validateBirthDate', () => {
  const now = new Date('2026-06-20T12:00:00.000Z');

  it('accepts adult users', () => {
    const result = validateBirthDate('1990-01-15', now);
    expect(result).toEqual({ ok: true, age: 36 });
  });

  it('accepts exactly 18 on the birthday', () => {
    expect(validateBirthDate('2008-06-20', now)).toEqual({ ok: true, age: 18 });
  });

  it('rejects 16–17 (no parental-consent path)', () => {
    expect(validateBirthDate('2010-06-20', now)).toEqual({ ok: false, code: 'too_young' });
    expect(validateBirthDate('2008-06-21', now)).toEqual({ ok: false, code: 'too_young' });
  });

  it('rejects under 16', () => {
    expect(validateBirthDate('2012-01-01', now)).toEqual({ ok: false, code: 'too_young' });
  });

  it('rejects invalid format', () => {
    expect(validateBirthDate('01/01/1990', now)).toEqual({ ok: false, code: 'invalid_date' });
  });

  it('rejects future dates', () => {
    expect(validateBirthDate('2030-01-01', now)).toEqual({ ok: false, code: 'future_date' });
  });
});

describe('calculateAge', () => {
  it('handles birthday not yet reached this year', () => {
    const age = calculateAge(new Date('2000-12-31T12:00:00.000Z'), new Date('2026-06-20T12:00:00.000Z'));
    expect(age).toBe(25);
  });
});
