import { describe, expect, it } from 'vitest';

import {
  appendPresenceReinforceFromChat,
  collectCompletedAcceptedTasks,
  collectPendingAcceptedTasks,
  planHabitCheckpointTriggers,
  type ProgressRow,
} from '../lib/workflows/habit-checkpoint-batch';

function row(partial: Partial<ProgressRow> & { user_id: string }): ProgressRow {
  return {
    updated_at: '2026-05-19T08:00:00.000Z',
    is_completed: false,
    task_statuses: {},
    habits_progress: {},
    journey_steps: null,
    ...partial,
  };
}

describe('planHabitCheckpointTriggers', () => {
  it('does not remind for habits already marked done today', () => {
    const progress: ProgressRow[] = [
      row({
        user_id: 'u1',
        habits_progress: { h1: [true] },
        journey_steps: {
          title: 'צעד',
          habits: [{ id: 'h1', title: 'מים', frequency: 'daily' }],
          tasks: [],
          journey_stations: null,
        },
      }),
    ];

    const plan = planHabitCheckpointTriggers(
      progress,
      'morning',
      new Date('2026-05-19T06:00:00+03:00')
    );
    expect(plan).toHaveLength(1);
    expect(plan[0]!.payload.notifyMode).toBe('reinforce');
    expect(plan[0]!.payload.habits).toHaveLength(0);
  });

  it('uses reinforce mode when all slot habits done and no pending tasks', () => {
    const progress: ProgressRow[] = [
      row({
        user_id: 'u1',
        habits_progress: { h1: [true] },
        task_statuses: {
          t1: { status: 'accepted', execution_done: true },
        },
        journey_steps: {
          title: 'צעד',
          habits: [{ id: 'h1', title: 'מים', frequency: 'daily' }],
          tasks: [{ id: 't1', title: 'משימה' }],
          journey_stations: null,
        },
      }),
    ];

    const plan = planHabitCheckpointTriggers(
      progress,
      'morning',
      new Date('2026-05-19T06:00:00+03:00')
    );
    expect(plan).toHaveLength(1);
    expect(plan[0]!.payload.notifyMode).toBe('reinforce');
    expect(plan[0]!.payload.habits).toHaveLength(0);
    expect(plan[0]!.payload.pendingTasks).toHaveLength(0);
    expect(plan[0]!.payload.completedTodayHabits).toHaveLength(1);
    expect(plan[0]!.payload.completedTodayTasks).toHaveLength(1);
  });

  it('remind mode excludes execution_done tasks', () => {
    const progress: ProgressRow[] = [
      row({
        user_id: 'u1',
        task_statuses: {
          t1: { status: 'accepted', execution_done: true },
          t2: { status: 'accepted', execution_done: false },
        },
        journey_steps: {
          title: 'צעד',
          habits: [],
          tasks: [
            { id: 't1', title: 'בוצע' },
            { id: 't2', title: 'פתוח' },
          ],
          journey_stations: null,
        },
      }),
    ];

    expect(collectPendingAcceptedTasks(progress)).toEqual([
      { id: 't2', title: 'פתוח', stepTitle: 'צעד' },
    ]);
    expect(collectCompletedAcceptedTasks(progress)).toEqual([{ id: 't1', title: 'בוצע' }]);

    const plan = planHabitCheckpointTriggers(
      progress,
      'midday',
      new Date('2026-05-19T13:00:00+03:00')
    );
    expect(plan[0]!.payload.notifyMode).toBe('remind');
    expect(plan[0]!.payload.pendingTasks.map((t) => t.id)).toEqual(['t2']);
  });

  it('adds presence reinforce when user chatted today and nothing to remind', () => {
    const progress: ProgressRow[] = [
      row({
        user_id: 'u-chat',
        journey_steps: {
          title: 'צעד',
          habits: [{ id: 'h1', title: 'מים', frequency: 'daily' }],
          tasks: [],
          journey_stations: null,
        },
      }),
    ];
    const base = planHabitCheckpointTriggers(
      progress,
      'midday',
      new Date('2026-05-19T13:00:00+03:00')
    );
    expect(base).toHaveLength(0);

    const withPresence = appendPresenceReinforceFromChat(
      base,
      progress,
      'midday',
      new Date('2026-05-19T13:00:00+03:00'),
      new Set(['u-chat'])
    );
    expect(withPresence).toHaveLength(1);
    expect(withPresence[0]!.payload.notifyMode).toBe('reinforce');
    expect(withPresence[0]!.payload.reinforceKind).toBe('presence');
  });
});
