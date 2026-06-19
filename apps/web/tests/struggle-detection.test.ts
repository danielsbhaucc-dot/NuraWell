import { describe, expect, it } from 'vitest';
import { detectJourneyStruggles } from '../lib/ai/almog-commitments/struggle-detection';
import { resolveCheckpointTaskTitle } from '../lib/ai/almog-commitments/recovery-state';
import type { ProgressRow } from '../lib/workflows/habit-checkpoint-batch';

const baseTask = {
  id: 'task-1',
  title: 'לשתות כוס מים',
  description: '',
  emoji: '💧',
  schedule: 'multi_daily' as const,
  times_per_day: 3,
  leveling: {
    levels: [
      { id: 'l1', label: 'רמה 1', order: 1, description: 'חצי כוס' },
      { id: 'l2', label: 'רמה 2', order: 2, is_recommended: true, description: 'כוס מלאה' },
    ],
  },
};

function progressRow(overrides: Partial<ProgressRow> = {}): ProgressRow {
  return {
    user_id: 'user-1',
    step_id: 'step-1',
    updated_at: new Date().toISOString(),
    is_completed: false,
    task_statuses: { 'task-1': { status: 'accepted' } },
    habits_progress: {},
    task_level_meta: {},
    journey_steps: {
      title: 'שיעור 1',
      habits: [],
      tasks: [baseTask],
      journey_stations: { title: 'תחנה' },
    },
    ...overrides,
  };
}

describe('struggle-detection', () => {
  it('detects partial execution when expected 3 but reported 1', () => {
    const now = new Date('2026-06-19T14:00:00.000Z');
    const signals = detectJourneyStruggles({
      userId: 'user-1',
      progressRows: [progressRow()],
      executions: [
        {
          task_id: 'task-1',
          date_key: '2026-06-19',
          slot: 'morning',
          outcome: 'completed',
        },
      ],
      now,
    });

    expect(signals.some((s) => s.kind === 'partial_today')).toBe(true);
    expect(signals.find((s) => s.kind === 'partial_today')?.severity).toBe('inquiry');
    expect(signals[0]?.expectedToday).toBe(3);
    expect(signals[0]?.reportedToday).toBe(1);
  });

  it('detects no update after noon when nothing reported today', () => {
    const now = new Date('2026-06-19T14:00:00.000Z');
    const signals = detectJourneyStruggles({
      userId: 'user-1',
      progressRows: [progressRow()],
      executions: [
        {
          task_id: 'task-1',
          date_key: '2026-06-18',
          slot: 'morning',
          outcome: 'completed',
        },
      ],
      now,
    });

    expect(signals.some((s) => s.kind === 'no_update_today')).toBe(true);
    expect(signals.find((s) => s.kind === 'no_update_today')?.severity).toBe('inquiry');
  });

  it('skips tasks already in active recovery', () => {
    const now = new Date('2026-06-19T14:00:00.000Z');
    const signals = detectJourneyStruggles({
      userId: 'user-1',
      progressRows: [progressRow()],
      executions: [],
      now,
      activeRecoveryTaskIds: new Set(['task-1']),
    });

    expect(signals.length).toBe(0);
  });
});

describe('resolveCheckpointTaskTitle', () => {
  it('returns eased title when recovery track exists', () => {
    const { title, inRecovery } = resolveCheckpointTaskTitle('task-1', 'כוס מים', {
      hasActiveRecovery: true,
      tracks: [
        {
          journeyTaskId: 'task-1',
          stepId: 'step-1',
          originalAssignmentId: 'p1',
          originalTitle: 'כוס מים',
          easedAssignmentId: 'e1',
          easedTitle: 'חצי כוס על הצלחת',
          blockerId: null,
          schedule: 'daily',
        },
      ],
    });
    expect(inRecovery).toBe(true);
    expect(title).toBe('חצי כוס על הצלחת');
  });
});
