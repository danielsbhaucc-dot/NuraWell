import { describe, expect, it } from 'vitest';
import {
  buildTimeAgoTextHe,
  deriveUrgencyLevel,
} from '../lib/notifications/engine/derive-urgency-level';
import { buildUserMessage } from '../lib/notifications/engine/generate-notification-text';
import type { AINotificationContext } from '../lib/types/notification-state';

function baseCtx(
  overrides: Partial<AINotificationContext> = {}
): AINotificationContext {
  return {
    user_first_name: 'דניאל',
    task_name: 'המים',
    time_of_day: 'morning',
    consecutive_missed_days: 0,
    has_completed_today: false,
    urgency_level: 'gentle',
    ...overrides,
  };
}

describe('deriveUrgencyLevel', () => {
  it('day 1 morning with no prior notifications today → gentle', () => {
    expect(
      deriveUrgencyLevel({
        timeOfDay: 'morning',
        consecutiveMissedDays: 0,
        notificationsTodaySent: 0,
      })
    ).toBe('gentle');
  });

  it('day 1 noon after morning notification → friendly_nudge', () => {
    expect(
      deriveUrgencyLevel({
        timeOfDay: 'noon',
        consecutiveMissedDays: 0,
        notificationsTodaySent: 1,
      })
    ).toBe('friendly_nudge');
  });

  it('day 1 evening after two notifications → friendly_nudge', () => {
    expect(
      deriveUrgencyLevel({
        timeOfDay: 'evening',
        consecutiveMissedDays: 0,
        notificationsTodaySent: 2,
      })
    ).toBe('friendly_nudge');
  });

  it('day 2 all slots → friendly_nudge', () => {
    for (const slot of ['morning', 'noon', 'evening'] as const) {
      expect(
        deriveUrgencyLevel({
          timeOfDay: slot,
          consecutiveMissedDays: 1,
          notificationsTodaySent: slot === 'morning' ? 0 : slot === 'noon' ? 1 : 2,
        })
      ).toBe('friendly_nudge');
    }
  });

  it('day 3 morning → concerned', () => {
    expect(
      deriveUrgencyLevel({
        timeOfDay: 'morning',
        consecutiveMissedDays: 2,
        notificationsTodaySent: 0,
      })
    ).toBe('concerned');
  });

  it('dormant 3-6 days → worried, 7+ → check_in', () => {
    expect(
      deriveUrgencyLevel({
        timeOfDay: 'morning',
        consecutiveMissedDays: 5,
      })
    ).toBe('worried');
    expect(
      deriveUrgencyLevel({
        timeOfDay: 'morning',
        consecutiveMissedDays: 7,
      })
    ).toBe('check_in');
  });
});

describe('buildTimeAgoTextHe', () => {
  it('maps streak days to Hebrew phrases', () => {
    expect(buildTimeAgoTextHe(0)).toBe('עוד לא היום');
    expect(buildTimeAgoTextHe(1)).toBe('מאמש');
    expect(buildTimeAgoTextHe(2)).toBe('משלשום');
    expect(buildTimeAgoTextHe(7)).toBe('שבוע');
  });
});

describe('buildUserMessage', () => {
  it('omits notifications_today_sent when zero', () => {
    const msg = buildUserMessage(baseCtx());
    expect(msg).not.toContain('התראות שכבר נשלחו היום');
  });

  it('includes notifications_today_sent when > 0', () => {
    const msg = buildUserMessage(
      baseCtx({
        time_of_day: 'noon',
        urgency_level: 'friendly_nudge',
        notifications_today_sent: 1,
      })
    );
    expect(msg).toContain('התראות שכבר נשלחו היום: 1');
    expect(msg).toContain('חלק יום: noon');
  });

  it('matrix snapshot: day 1 evening third notification', () => {
    const msg = buildUserMessage(
      baseCtx({
        time_of_day: 'evening',
        urgency_level: 'friendly_nudge',
        notifications_today_sent: 2,
        time_ago_text: 'עוד לא היום',
      })
    );
    expect(msg).toContain('התראות שכבר נשלחו היום: 2');
    expect(msg).toContain('טון נדרש: friendly_nudge');
    expect(msg).toContain('שם: דניאל');
    expect(msg).toContain('משימה: המים');
  });

  it('matrix snapshot: day 2 morning after yesterday miss', () => {
    const msg = buildUserMessage(
      baseCtx({
        consecutive_missed_days: 1,
        urgency_level: 'friendly_nudge',
        time_ago_text: 'מאמש',
      })
    );
    expect(msg).toContain('ימים רצוף ללא ביצוע: 1');
    expect(msg).toContain('כמה זמן: מאמש');
    expect(msg).not.toContain('התראות שכבר נשלחו היום');
  });

  it('matrix snapshot: day 2 noon with one notification today', () => {
    const msg = buildUserMessage(
      baseCtx({
        time_of_day: 'noon',
        consecutive_missed_days: 1,
        urgency_level: 'friendly_nudge',
        notifications_today_sent: 1,
        time_ago_text: 'מאמש',
      })
    );
    expect(msg).toContain('התראות שכבר נשלחו היום: 1');
    expect(msg).toContain('חלק יום: noon');
  });
});
