import { describe, expect, it } from 'vitest';

import { shouldSkipNotifyForTouchFatigue } from '../lib/ai/almog-daily-context';
import type { TodayAlmogTouch } from '../lib/ai/almog-notify-day-context';
import {
  HABIT_INSIGHT_NOTIFY_SOURCES,
  hasRecentSimilarHabitNotification,
} from '../lib/notifications/similar-habit-dedupe';
import { mapAlmogStatusToUnified } from '../lib/tasks/user-task-ssot';
import {
  formatSleepDisplay,
  formatSleepDisplayLabeled,
  genderDisplayLabel,
} from '../lib/profile/profile-field-ssot';
import { genderLabel } from '../lib/profile/personalized-copy';

describe('daily almog touch cap (all modes)', () => {
  const three: TodayAlmogTouch[] = [1, 2, 3].map((i) => ({
    slot: 'morning' as const,
    slotLabel: 'בוקר',
    bodySnippet: `m${i}`,
    sentAt: `2026-05-19T0${i}:00:00Z`,
    userRepliedSince: false,
  }));

  it('blocks remind, reinforce, and presence at 3 touches', () => {
    expect(shouldSkipNotifyForTouchFatigue(three, 'remind')).toBe(true);
    expect(shouldSkipNotifyForTouchFatigue(three, 'reinforce')).toBe(true);
    expect(shouldSkipNotifyForTouchFatigue(three, 'presence')).toBe(true);
    expect(shouldSkipNotifyForTouchFatigue(three.slice(0, 2), 'presence')).toBe(false);
  });
});

describe('similar habit dedupe across senders', () => {
  it('covers personalized check-in and followup sources', () => {
    expect(HABIT_INSIGHT_NOTIFY_SOURCES.has('almog_personalized_check_in')).toBe(true);
    expect(HABIT_INSIGHT_NOTIFY_SOURCES.has('almog_followup_workflow')).toBe(true);

    const now = Date.parse('2026-05-19T12:00:00Z');
    const recent = [
      {
        source: 'almog_personalized_check_in',
        habit_ids: ['habit-water'],
        created_at: '2026-05-19T11:00:00Z',
      },
    ];
    expect(hasRecentSimilarHabitNotification(recent, ['habit-water'], now)).toBe(true);
    expect(hasRecentSimilarHabitNotification(recent, ['habit-sleep'], now)).toBe(false);
  });

  it('treats any almog_* source with habit_ids as insight', () => {
    const now = Date.parse('2026-05-19T12:00:00Z');
    expect(
      hasRecentSimilarHabitNotification(
        [
          {
            source: 'almog_future_sender',
            habit_ids: ['h1'],
            created_at: '2026-05-19T11:30:00Z',
          },
        ],
        ['h1'],
        now
      )
    ).toBe(true);
  });
});

describe('history rejected includes almog dropped (SSOT mapping)', () => {
  it('maps dropped → rejected', () => {
    expect(mapAlmogStatusToUnified('dropped')).toBe('rejected');
  });
});

describe('profile field SSOT', () => {
  it('genderLabel delegates to genderDisplayLabel', () => {
    expect(genderLabel('male')).toBe(genderDisplayLabel('male'));
    expect(genderLabel('female')).toBe(genderDisplayLabel('female'));
    expect(genderLabel(null)).toBe('');
  });

  it('sleep display helpers stay consistent', () => {
    const rhythm = { wake_up_time: '06:30', sleep_time: '22:00' };
    expect(formatSleepDisplay(rhythm)).toBe('06:30 · 22:00');
    expect(formatSleepDisplayLabeled(rhythm)).toBe('השכמה 06:30 · שינה 22:00');
    expect(formatSleepDisplay({ wake_up_time: null, sleep_time: null })).toBe('— · —');
  });
});
