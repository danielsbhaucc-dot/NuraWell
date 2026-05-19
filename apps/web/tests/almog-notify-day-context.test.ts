import { describe, expect, it } from 'vitest';

import {
  buildSlotDaypartPromptBlock,
  formatTodayTouchesCooldownBlock,
  shouldFetchWeekRecentBodies,
  type TodayAlmogTouch,
} from '../lib/ai/almog-notify-day-context';

describe('formatTodayTouchesCooldownBlock', () => {
  it('returns null when no prior touches today', () => {
    expect(formatTodayTouchesCooldownBlock([], 'midday')).toBeNull();
  });

  it('includes skip rule when morning touch had no reply', () => {
    const touches: TodayAlmogTouch[] = [
      {
        slot: 'morning',
        slotLabel: 'בוקר',
        bodySnippet: 'בוקר טוב',
        sentAt: '2026-05-19T06:00:00.000Z',
        userRepliedSince: false,
      },
    ];
    const block = formatTodayTouchesCooldownBlock(touches, 'midday');
    expect(block).toContain('דילוג');
    expect(block).toContain('ללא תשובה');
  });
});

describe('shouldFetchWeekRecentBodies', () => {
  it('skips week history when prior touch exists today', () => {
    const touches: TodayAlmogTouch[] = [
      {
        slot: 'morning',
        slotLabel: 'בוקר',
        bodySnippet: 'היי',
        sentAt: '2026-05-19T06:00:00.000Z',
        userRepliedSince: false,
      },
    ];
    expect(shouldFetchWeekRecentBodies(touches, 'midday')).toBe(false);
    expect(shouldFetchWeekRecentBodies([], 'midday')).toBe(true);
  });
});

describe('buildSlotDaypartPromptBlock', () => {
  it('returns evening tone for evening slot', () => {
    const block = buildSlotDaypartPromptBlock('evening');
    expect(block).toContain('ערב');
    expect(block).toContain('ערב');
  });
});
