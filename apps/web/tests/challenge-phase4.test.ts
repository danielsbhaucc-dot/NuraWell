import { describe, expect, it } from 'vitest';
import { getCelebrationForTask } from '@/lib/challenge/celebrations';
import { getEatingWindowStatus } from '@/lib/challenge/eating-window-status';
import { buildChallengePatternInsights, aggregateSuccessByType } from '@/lib/challenge/insights';
import { resolveTaskSlots, countRequiredCompletionsForDay } from '@/lib/challenge/task-slots';

describe('getEatingWindowStatus', () => {
  it('reports open when within window', () => {
    const config = {
      start: '08:00',
      end: '20:00',
      last_meal_recommended: '20:00',
      sleep_buffer_minutes: 120,
      first_meal: '08:00',
      last_meal: '20:00',
    };
    const noon = new Date('2026-06-29T12:00:00+03:00');
    const status = getEatingWindowStatus(config, noon);
    expect(status.is_open).toBe(true);
    expect(status.minutes_until_close).toBeGreaterThan(0);
  });
});

describe('resolveTaskSlots per_meal', () => {
  it('creates slot per meal in profile', () => {
    const slots = resolveTaskSlots(
      { task_key: 'water_before_meals', schedule_type: 'per_meal' },
      {
        meal_schedule: [
          { time: '08:00' },
          { time: '13:00' },
          { time: '19:00' },
        ],
      },
      new Set(),
    );
    expect(slots).toHaveLength(3);
    expect(slots[0].label).toContain('בוקר');
  });

  it('counts required completions correctly', () => {
    const total = countRequiredCompletionsForDay(
      [
        { task_key: 'water_morning', schedule_type: 'morning' },
        { task_key: 'water_before_meals', schedule_type: 'per_meal' },
      ],
      { meal_schedule: [{ time: '08:00' }, { time: '13:00' }, { time: '19:00' }] },
    );
    expect(total).toBe(4);
  });
});

describe('getCelebrationForTask', () => {
  it('returns day complete celebration', () => {
    const c = getCelebrationForTask({ taskKey: 'water_morning', dayComplete: true, dayIndex: 3 });
    expect(c.variant).toBe('day_complete');
    expect(c.title).toContain('3');
  });

  it('returns water celebration for morning water', () => {
    const c = getCelebrationForTask({ taskKey: 'water_morning' });
    expect(c.emoji).toBe('💧');
  });
});

describe('buildChallengePatternInsights', () => {
  it('surfaces language shift insight', () => {
    const insights = buildChallengePatternInsights({
      successEvents: [
        {
          event_type: 'language_shift',
          title: 'שינית את השפה',
          description: 'פחות שלילי',
        },
      ],
      completions: [{ day_index: 1, task_definition_id: 'a' }],
      currentDay: 2,
      daysTotal: 14,
    });
    expect(insights.some((i) => i.id === 'language_shift')).toBe(true);
  });
});

describe('aggregateSuccessByType', () => {
  it('groups events by type', () => {
    const rows = aggregateSuccessByType([
      { event_type: 'day_complete' },
      { event_type: 'day_complete' },
      { event_type: 'language_shift' },
    ]);
    expect(rows.find((r) => r.type === 'day_complete')?.count).toBe(2);
  });
});
