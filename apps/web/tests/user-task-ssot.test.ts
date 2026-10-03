import { describe, expect, it } from 'vitest';
import {
  buildUserTaskSnapshot,
  hasAnyTakenTasks,
  mapAlmogStatusToUnified,
  mapJourneyDecisionToUnified,
} from '../lib/tasks/user-task-ssot';
import {
  genderDisplayLabel,
  resolveDisplayWeightKg,
} from '../lib/profile/profile-field-ssot';
import { getIsraelTimeOfDay } from '../lib/time/greeting';

describe('user-task-ssot', () => {
  it('maps journey + almog statuses to a single vocabulary', () => {
    expect(mapJourneyDecisionToUnified('accepted')).toBe('active');
    expect(mapJourneyDecisionToUnified('accepted', { doneForToday: true })).toBe('completed');
    expect(mapJourneyDecisionToUnified('rejected')).toBe('rejected');
    expect(mapAlmogStatusToUnified('active')).toBe('active');
    expect(mapAlmogStatusToUnified('frozen')).toBe('active');
    expect(mapAlmogStatusToUnified('completed')).toBe('completed');
    expect(mapAlmogStatusToUnified('dropped')).toBe('rejected');
  });

  it('unifies home/plans/journey counters when only almog tasks exist', () => {
    const snapshot = buildUserTaskSnapshot({
      steps: [
        {
          id: 's1',
          title: 'צעד',
          step_number: 1,
          tasks: [{ id: 't1', title: 'משימת מסע', emoji: '✅', schedule: 'daily' }],
          progress: { task_statuses: {} },
        },
      ],
      todayExecutions: [],
      todayDateKey: '2026-10-03',
      almogAssignments: [
        { id: 'a1', title: 'לשתות מים', status: 'active', schedule: 'daily' },
        { id: 'a2', title: 'הליכה', status: 'frozen', schedule: 'one_time' },
      ],
      almogCompleted: [
        { id: 'c1', title: 'ישן מוקדם', status: 'completed', schedule: 'one_time' },
      ],
      almogDroppedCount: 1,
    });

    // בית לא אמור להראות 0 כשיש משימות אלמוג פתוחות
    expect(snapshot.counts.unified.dueToday).toBe(2);
    expect(snapshot.counts.unified.pendingToday).toBe(2);
    expect(snapshot.counts.almog.active).toBe(2);
    expect(snapshot.counts.almog.completed).toBe(1);
    expect(snapshot.counts.unified.rejected).toBe(1);
    expect(hasAnyTakenTasks(snapshot.counts)).toBe(true);

    // השוואת מונים בין מסכים — אותו מקור
    const homeDue = snapshot.counts.unified.dueToday;
    const plansActive = snapshot.counts.almog.active;
    const journeyOpen = snapshot.almogOpen.length;
    expect(homeDue).toBe(plansActive);
    expect(plansActive).toBe(journeyOpen);
  });

  it('keeps journey today counts when tasks are accepted', () => {
    const snapshot = buildUserTaskSnapshot({
      steps: [
        {
          id: 's1',
          title: 'צעד',
          step_number: 1,
          tasks: [
            {
              id: 't1',
              title: 'מים',
              emoji: '💧',
              schedule: 'one_time',
            },
          ],
          progress: {
            task_statuses: {
              t1: { status: 'accepted', execution_done: false },
            },
          },
        },
      ],
      todayExecutions: [],
      almogAssignments: [],
      almogCompleted: [],
    });

    expect(snapshot.counts.journey.accepted).toBe(1);
    expect(snapshot.counts.unified.dueToday).toBe(1);
    expect(snapshot.counts.unified.pendingToday).toBe(1);
    expect(snapshot.journeyToday).toHaveLength(1);
  });
});

describe('profile-field-ssot', () => {
  it('uses one gender dictionary', () => {
    expect(genderDisplayLabel('male')).toBe('גבר');
    expect(genderDisplayLabel('female')).toBe('אישה');
  });

  it('prefers profile weight, falls back to latest measurement', () => {
    expect(resolveDisplayWeightKg(null, 100)).toBe(100);
    expect(resolveDisplayWeightKg(88, 100)).toBe(88);
    expect(resolveDisplayWeightKg(null, null)).toBeNull();
  });
});

describe('greeting SSOT', () => {
  it('uses Asia/Jerusalem buckets consistently', () => {
    // 08:00 UTC = 11:00 Israel (DST) or 10:00 — either way morning before noon Israel
    const morning = getIsraelTimeOfDay(new Date('2026-01-15T06:00:00.000Z'));
    expect(morning.bucket).toBe('morning');
    expect(morning.greeting).toBe('בוקר טוב');

    // 12:30 Israel winter ≈ 10:30 UTC
    const noon = getIsraelTimeOfDay(new Date('2026-01-15T10:30:00.000Z'));
    expect(noon.bucket).toBe('noon');
    expect(noon.greeting).toBe('צהריים טובים');
  });
});
