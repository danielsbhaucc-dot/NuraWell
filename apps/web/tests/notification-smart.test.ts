import { describe, expect, it } from 'vitest';

import { buildAlmogNotificationTitle } from '../lib/notifications/build-almog-notification-title';
import { formatFallMemoryPromptBlock } from '../lib/notifications/fall-memory';
import type { AlmogHabitCheckpointPayload } from '../lib/workflows/almog-habit-checkpoint-payload';

function basePayload(
  overrides: Partial<AlmogHabitCheckpointPayload> = {}
): AlmogHabitCheckpointPayload {
  return {
    userId: '00000000-0000-4000-8000-000000000001',
    slot: 'morning',
    checkpointDate: '2026-05-19',
    notifyMode: 'remind',
    habits: [],
    pendingTasks: [{ id: 't1', title: 'מים' }],
    completedTodayHabits: [],
    completedTodayTasks: [],
    nudgeLevel: 0,
    daysSinceLastActive: 0,
    completionStatus: 'none',
    cadenceStage: 'active',
    urgencyLevel: 'gentle',
    notificationCount: 0,
    ...overrides,
  };
}

describe('buildAlmogNotificationTitle', () => {
  it('repeat fall pattern → שוב נעלמת לי', () => {
    const title = buildAlmogNotificationTitle({
      firstName: 'דניאל',
      payload: basePayload({ daysSinceLastActive: 2 }),
      fallMemory: {
        openEpisode: null,
        recentRecovered: [],
        totalFallsLast90Days: 2,
        isRepeatPattern: true,
      },
    });
    expect(title).toContain('שוב נעלמת לי');
    expect(title).toContain('דניאל');
  });

  it('morning active user → ברכת בוקר', () => {
    const title = buildAlmogNotificationTitle({
      firstName: 'דניאל',
      payload: basePayload({ slot: 'morning', daysSinceLastActive: 0 }),
    });
    expect(title).toContain('בוקר טוב');
  });

  it('full completion → חיזוק', () => {
    const title = buildAlmogNotificationTitle({
      firstName: 'דניאל',
      payload: basePayload({ completionStatus: 'full' }),
    });
    expect(title).toContain('יפה');
  });
});

describe('formatFallMemoryPromptBlock', () => {
  it('includes repeat pattern hint', () => {
    const block = formatFallMemoryPromptBlock({
      openEpisode: {
        id: 'ep1',
        user_id: 'u1',
        status: 'open',
        started_at: '2026-05-10T08:00:00Z',
        ended_at: null,
        first_seen_date: '2026-05-10',
        last_seen_date: '2026-05-19',
        max_days_absent: 3,
        last_activity_at: null,
        reason_summary: 'היה לי עמוס בעבודה',
        reason_source: 'chat',
        metadata: {},
      },
      recentRecovered: [
        {
          id: 'ep0',
          user_id: 'u1',
          status: 'recovered',
          started_at: '2026-04-01T08:00:00Z',
          ended_at: '2026-04-06T08:00:00Z',
          first_seen_date: '2026-04-01',
          last_seen_date: '2026-04-05',
          max_days_absent: 5,
          last_activity_at: null,
          reason_summary: 'נסיעה',
          reason_source: 'chat',
          metadata: {},
        },
      ],
      totalFallsLast90Days: 2,
      isRepeatPattern: true,
    });
    expect(block).toContain('נפילה חוזרת');
    expect(block).toContain('שוב נעלמת לי');
    expect(block).toContain('עמוס בעבודה');
  });
});
