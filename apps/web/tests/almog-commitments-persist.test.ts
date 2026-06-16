import { describe, expect, it } from 'vitest';

import { reminderDedupeKey } from '../lib/ai/almog-commitments/persist';

describe('reminderDedupeKey', () => {
  it('מבדיל בין שתי תזכורות לאותו נושא באותו יום אבל בזמן אחר', () => {
    const first = reminderDedupeKey('לשתות מים', '2026-06-16T13:05:00.000Z');
    const second = reminderDedupeKey('לשתות מים', '2026-06-16T13:30:00.000Z');

    expect(first).not.toBe(second);
  });

  it('משאיר אותו מפתח לאותו נושא ואותה דקה כדי למנוע retry כפול', () => {
    const first = reminderDedupeKey('לשתות מים', '2026-06-16T13:05:00.000Z');
    const retry = reminderDedupeKey('לשתות מים', '2026-06-16T13:05:30.000Z');

    expect(first).toBe(retry);
  });
});
