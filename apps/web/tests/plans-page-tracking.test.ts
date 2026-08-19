import { describe, expect, it } from 'vitest';

import {
  checkpointShouldOpenPlansPage,
  collectPendingPlanAssignments,
  formatPlansPageSnapshotForChat,
  isPlanAssignmentPendingToday,
  mergePendingPlanAssignmentsIntoCheckpoints,
  type PendingPlanAssignment,
} from '../lib/ai/almog-commitments/plans-page-tracking';
import type { AlmogCommitmentContext } from '../lib/ai/almog-commitments/types';
import type { HabitCheckpointPlanItem } from '../lib/workflows/habit-checkpoint-batch';

const NOW = new Date('2026-08-19T07:00:00.000Z');

function assignment(partial: Partial<PendingPlanAssignment> & { id: string }): PendingPlanAssignment {
  return {
    userId: 'u1',
    title: 'כוס אחת',
    schedule: 'daily',
    lastDoneAt: null,
    journeyTaskId: null,
    relation: 'standalone',
    ...partial,
  };
}

describe('plans-page-tracking', () => {
  it('treats missing last_done_at as pending today', () => {
    expect(isPlanAssignmentPendingToday(null, NOW)).toBe(true);
  });

  it('skips assignments already done today (Jerusalem)', () => {
    expect(isPlanAssignmentPendingToday('2026-08-19T08:00:00.000Z', NOW)).toBe(false);
    expect(isPlanAssignmentPendingToday('2026-08-18T08:00:00.000Z', NOW)).toBe(true);
  });

  it('collects only pending assignments', () => {
    const pending = collectPendingPlanAssignments(
      [
        assignment({ id: 'a1', lastDoneAt: null }),
        assignment({ id: 'a2', lastDoneAt: '2026-08-19T10:00:00.000Z' }),
      ],
      NOW
    );
    expect(pending.map((a) => a.id)).toEqual(['a1']);
  });

  it('merges a standalone plan step into an existing checkpoint', () => {
    const existing: HabitCheckpointPlanItem = {
      userId: 'u1',
      payload: {
        userId: 'u1',
        slot: 'morning',
        checkpointDate: '2026-08-19',
        notifyMode: 'reinforce',
        reinforceKind: 'presence',
        habits: [],
        pendingTasks: [],
        completedTodayHabits: [],
        completedTodayTasks: [],
        nudgeLevel: 0,
        daysSinceLastActive: 0,
        completionStatus: 'full',
        cadenceStage: 'active',
        urgencyLevel: 'gentle',
        notificationCount: 0,
      },
    };
    const merged = mergePendingPlanAssignmentsIntoCheckpoints({
      plan: [existing],
      assignmentsByUser: new Map([['u1', [assignment({ id: 'p1' })]]]),
      slot: 'morning',
      checkpointDate: '2026-08-19',
    });
    expect(merged).toHaveLength(1);
    expect(merged[0]!.payload.notifyMode).toBe('remind');
    expect(merged[0]!.payload.pendingTasks).toEqual([
      expect.objectContaining({
        id: 'plan:p1',
        title: 'כוס אחת',
        fromPlansPage: true,
        stepTitle: 'התוכנית שלי',
      }),
    ]);
    expect(checkpointShouldOpenPlansPage(merged[0]!.payload)).toBe(true);
  });

  it('does not duplicate a recovery step already represented by journey_task_id', () => {
    const existing: HabitCheckpointPlanItem = {
      userId: 'u1',
      payload: {
        userId: 'u1',
        slot: 'morning',
        checkpointDate: '2026-08-19',
        notifyMode: 'remind',
        habits: [],
        pendingTasks: [{ id: 'task-1', title: 'כוס אחת', fromPlansPage: true }],
        completedTodayHabits: [],
        completedTodayTasks: [],
        nudgeLevel: 0,
        daysSinceLastActive: 0,
        completionStatus: 'none',
        cadenceStage: 'active',
        urgencyLevel: 'gentle',
        notificationCount: 0,
      },
    };
    const merged = mergePendingPlanAssignmentsIntoCheckpoints({
      plan: [existing],
      assignmentsByUser: new Map([
        ['u1', [assignment({ id: 'p1', journeyTaskId: 'task-1' })]],
      ]),
      slot: 'morning',
      checkpointDate: '2026-08-19',
    });
    expect(merged[0]!.payload.pendingTasks).toHaveLength(1);
  });

  it('creates a checkpoint for a user who only has a plans-page assignment', () => {
    const merged = mergePendingPlanAssignmentsIntoCheckpoints({
      plan: [],
      assignmentsByUser: new Map([['u2', [assignment({ id: 'p9', userId: 'u2' })]]]),
      slot: 'evening',
      checkpointDate: '2026-08-19',
    });
    expect(merged).toHaveLength(1);
    expect(merged[0]!.userId).toBe('u2');
    expect(merged[0]!.payload.pendingTasks[0]?.id).toBe('plan:p9');
    expect(checkpointShouldOpenPlansPage(merged[0]!.payload)).toBe(true);
  });

  it('builds a chat snapshot from the plans page', () => {
    const ctx: AlmogCommitmentContext = {
      activeAssignments: [
        {
          id: 'a1',
          title: 'כוס אחת',
          reason: 'קל יותר',
          schedule: 'daily',
          status: 'active',
          given_at: '2026-08-18T08:00:00.000Z',
          last_done_at: null,
          related_habit_id: null,
          relation: 'eases',
        },
      ],
      openBlockers: [],
      recentInterventions: [],
      nextReminders: [],
      activeFocus: null,
      recoveryState: null,
      unansweredRecovery: [],
      activeStruggles: [],
      recentSosMoments: [],
    };
    const block = formatPlansPageSnapshotForChat(ctx);
    expect(block).toContain('עמוד "התוכנית שלי"');
    expect(block).toContain('כוס אחת');
    expect(block).toContain('עקוב לפי העמוד הזה');
  });
});
