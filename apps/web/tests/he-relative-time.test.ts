import { describe, expect, it } from 'vitest';
import { formatHebrewRelativeTimeSmart } from '../lib/date/he-relative-time';

describe('he-relative-time', () => {
  const now = new Date('2026-06-28T12:00:00.000Z');

  it('formats short hour ranges in Hebrew', () => {
    expect(formatHebrewRelativeTimeSmart('2026-06-28T11:00:00.000Z', now)).toBe('לפני שעה');
    expect(formatHebrewRelativeTimeSmart('2026-06-28T10:00:00.000Z', now)).toBe('לפני שעתיים');
  });

  it('formats yesterday and day before yesterday labels', () => {
    expect(formatHebrewRelativeTimeSmart('2026-06-27T12:00:00.000Z', now)).toBe('אתמול');
    expect(formatHebrewRelativeTimeSmart('2026-06-26T12:00:00.000Z', now)).toBe('שלשום');
  });

  it('formats half year exactly', () => {
    expect(formatHebrewRelativeTimeSmart('2025-12-28T12:00:00.000Z', now)).toBe('לפני חצי שנה');
  });

  it('formats year ranges naturally', () => {
    expect(formatHebrewRelativeTimeSmart('2025-06-28T12:00:00.000Z', now)).toBe('לפני שנה');
    expect(formatHebrewRelativeTimeSmart('2024-06-28T12:00:00.000Z', now)).toBe('לפני שנתיים');
  });
});
