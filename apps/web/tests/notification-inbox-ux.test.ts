import { describe, expect, it } from 'vitest';

import { truncateAtWordBoundary } from '../lib/text/truncate-graphemes';
import {
  formatUnreadBadgeCount,
  formatUnreadBellAriaLabel,
} from '../lib/notifications/format-unread-badge';
import { groupSimilarNotifications } from '../lib/notifications/group-similar';
import { hasRecentSimilarHabitNotification } from '../lib/notifications/similar-habit-dedupe';

describe('truncateAtWordBoundary', () => {
  it('returns short text unchanged', () => {
    expect(truncateAtWordBoundary('שלום', 24)).toBe('שלום');
  });

  it('cuts on word boundary and appends ellipsis for Hebrew', () => {
    const text = 'שתיית שתי כוסות מים בבוקר לפני העבודה';
    const out = truncateAtWordBoundary(text, 18);
    expect(out.endsWith('…')).toBe(true);
    expect(out.includes('�')).toBe(false);
    // לא חותך באמצע המילה "כוסות" לתו שבור
    expect(out).toMatch(/…$/);
    expect([...out.replace(/…$/, '')].length).toBeLessThanOrEqual(18);
  });

  it('does not split emoji grapheme clusters', () => {
    const text = `בוקר טוב ${'👋'.repeat(10)} המשך נעים`;
    const out = truncateAtWordBoundary(text, 12);
    expect(out.includes('\uFFFD')).toBe(false);
    expect(out.endsWith('…')).toBe(true);
  });
});

describe('formatUnreadBadge', () => {
  it('shows exact counts up to 99 and 99+ above', () => {
    expect(formatUnreadBadgeCount(9)).toBe('9');
    expect(formatUnreadBadgeCount(99)).toBe('99');
    expect(formatUnreadBadgeCount(100)).toBe('99+');
    expect(formatUnreadBadgeCount(510)).toBe('99+');
  });

  it('keeps aria label aligned with badge text', () => {
    expect(formatUnreadBellAriaLabel(510)).toBe('התראות, 99+ שלא נקראו');
    expect(formatUnreadBellAriaLabel(3)).toBe('התראות, 3 שלא נקראו');
    expect(formatUnreadBellAriaLabel(0)).toBe('התראות');
  });
});

describe('groupSimilarNotifications', () => {
  const base = {
    body: 'בוא נזכור לשתות',
    is_read: false,
    created_at: '2026-05-19T10:00:00Z',
    source: 'almog_habit_checkpoint' as const,
    habitIds: ['habit-water'],
    habitTitles: ['שתיית מים'],
  };

  it('groups consecutive checkpoint notifications for the same habit', () => {
    const items = [
      { ...base, id: '1', title: 'א', created_at: '2026-05-19T12:00:00Z' },
      { ...base, id: '2', title: 'ב', created_at: '2026-05-19T11:00:00Z' },
      { ...base, id: '3', title: 'ג', created_at: '2026-05-19T10:00:00Z' },
    ];
    const grouped = groupSimilarNotifications(items);
    expect(grouped).toHaveLength(1);
    expect(grouped[0]?.kind).toBe('group');
    if (grouped[0]?.kind === 'group') {
      expect(grouped[0].groupTitle).toBe('3 תובנות על שתיית מים');
      expect(grouped[0].notifications).toHaveLength(3);
    }
  });

  it('does not group unrelated notifications', () => {
    const items = [
      { ...base, id: '1', title: 'א' },
      {
        ...base,
        id: '2',
        title: 'ב',
        habitIds: ['habit-sleep'],
        habitTitles: ['שינה'],
      },
    ];
    const grouped = groupSimilarNotifications(items);
    expect(grouped).toHaveLength(2);
    expect(grouped.every((e) => e.kind === 'single')).toBe(true);
  });
});

describe('hasRecentSimilarHabitNotification', () => {
  it('detects overlap within cooldown window', () => {
    const now = Date.parse('2026-05-19T12:00:00Z');
    const recent = [
      {
        source: 'almog_habit_checkpoint',
        habit_ids: ['habit-water'],
        created_at: '2026-05-19T10:00:00Z',
      },
    ];
    expect(hasRecentSimilarHabitNotification(recent, ['habit-water'], now)).toBe(true);
    expect(hasRecentSimilarHabitNotification(recent, ['habit-sleep'], now)).toBe(false);
  });

  it('ignores notifications outside cooldown', () => {
    const now = Date.parse('2026-05-19T14:00:00Z');
    const recent = [
      {
        source: 'almog_habit_checkpoint',
        habit_ids: ['habit-water'],
        created_at: '2026-05-19T10:00:00Z',
      },
    ];
    expect(hasRecentSimilarHabitNotification(recent, ['habit-water'], now)).toBe(false);
  });

  it('dedupes across personalized check-in sender', () => {
    const now = Date.parse('2026-05-19T12:00:00Z');
    expect(
      hasRecentSimilarHabitNotification(
        [
          {
            source: 'almog_personalized_check_in',
            habit_ids: ['habit-water'],
            created_at: '2026-05-19T11:00:00Z',
          },
        ],
        ['habit-water'],
        now
      )
    ).toBe(true);
  });
});
