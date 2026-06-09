import { describe, expect, it } from 'vitest';

import {
  fetchTrueLastActiveByUser,
  planHabitCheckpointTriggers,
  type ProgressRow,
  type ReengagementUserInfo,
} from '../lib/workflows/habit-checkpoint-batch';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Mock chainable Supabase builder. כל method מחזירה את אותו אובייקט; ה-builder
 * עצמו thenable ומחזיר את ה-data שהוגדר לטבלה הספציפית (לפי .from(table)).
 */
function makeAdminMock(dataByTable: Record<string, unknown[]>) {
  function builderFor(table: string) {
    const data = dataByTable[table] ?? [];
    const builder: Record<string, unknown> = {};
    const passthrough = () => builder;
    for (const m of ['select', 'in', 'eq', 'gte', 'lte', 'order', 'limit', 'not']) {
      builder[m] = passthrough;
    }
    // thenable — Promise.all יחכה לזה.
    builder.then = (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
      resolve({ data, error: null });
    return builder;
  }
  return {
    from: (table: string) => builderFor(table),
  };
}

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

describe('fetchTrueLastActiveByUser — last_engaged_at signal', () => {
  const now = new Date('2026-05-19T08:00:00.000Z');
  const createdAt = new Date(now.getTime() - 30 * DAY_MS).toISOString();

  it('uses journey_progress.last_engaged_at as a genuine activity signal', async () => {
    const engagedAt = new Date(now.getTime() - 1 * DAY_MS).toISOString();
    const admin = makeAdminMock({
      profiles: [{ id: 'u1', created_at: createdAt }],
      ai_interactions: [], // no chat
      journey_task_executions: [], // no executions
      journey_progress: [{ user_id: 'u1', last_engaged_at: engagedAt }],
    });

    const map = await fetchTrueLastActiveByUser(admin, ['u1'], now);
    // למרות שאין צ'אט/execution — עדכון פרוגרס (last_engaged_at) מאפס dormancy.
    expect(map.get('u1')).toBe(engagedAt);
  });

  it('takes MAX across chat, executions, and last_engaged_at', async () => {
    const chatAt = new Date(now.getTime() - 5 * DAY_MS).toISOString();
    const execAt = new Date(now.getTime() - 3 * DAY_MS).toISOString();
    const engagedAt = new Date(now.getTime() - 1 * DAY_MS).toISOString(); // most recent
    const admin = makeAdminMock({
      profiles: [{ id: 'u1', created_at: createdAt }],
      ai_interactions: [{ user_id: 'u1', created_at: chatAt }],
      journey_task_executions: [{ user_id: 'u1', completed_at: execAt }],
      journey_progress: [{ user_id: 'u1', last_engaged_at: engagedAt }],
    });

    const map = await fetchTrueLastActiveByUser(admin, ['u1'], now);
    expect(map.get('u1')).toBe(engagedAt);
  });

  it('falls back to created_at floor when no signals exist', async () => {
    const admin = makeAdminMock({
      profiles: [{ id: 'u1', created_at: createdAt }],
      ai_interactions: [],
      journey_task_executions: [],
      journey_progress: [],
    });

    const map = await fetchTrueLastActiveByUser(admin, ['u1'], now);
    expect(map.get('u1')).toBe(createdAt);
  });

  it('chat still wins when it is the most recent signal', async () => {
    const chatAt = new Date(now.getTime() - 1 * DAY_MS).toISOString();
    const engagedAt = new Date(now.getTime() - 6 * DAY_MS).toISOString();
    const admin = makeAdminMock({
      profiles: [{ id: 'u1', created_at: createdAt }],
      ai_interactions: [{ user_id: 'u1', created_at: chatAt }],
      journey_task_executions: [],
      journey_progress: [{ user_id: 'u1', last_engaged_at: engagedAt }],
    });

    const map = await fetchTrueLastActiveByUser(admin, ['u1'], now);
    expect(map.get('u1')).toBe(chatAt);
  });
});

describe('planHabitCheckpointTriggers — breakup reactivation', () => {
  const now = new Date('2026-05-19T08:00:00+03:00');

  function pendingTaskRow(userId: string): ProgressRow {
    return row({
      user_id: userId,
      task_statuses: { t1: { status: 'accepted', execution_done: false } },
      journey_steps: {
        title: 'צעד',
        habits: [],
        tasks: [{ id: 't1', title: 'להגיש דוח' }],
        journey_stations: null,
      },
    });
  }

  it('reactivated user (active again) is NOT silenced despite stale breakup flag', () => {
    const progress = [pendingTaskRow('u-react')];
    const todayIso = now.toISOString();
    const lastActive = new Map<string, string | null>([['u-react', todayIso]]);

    const reengagement = new Map<string, ReengagementUserInfo>([
      [
        'u-react',
        {
          enabled: true,
          sentMoves: ['breakup'],
          breakupSentAt: new Date(now.getTime() - 12 * DAY_MS).toISOString(),
        },
      ],
    ]);

    const plan = planHabitCheckpointTriggers(
      progress,
      'morning',
      now,
      new Map(),
      lastActive,
      new Map(),
      new Map(),
      reengagement
    );

    // חזר להיות active (0 ימים) → flag ה-breakup הישן לא משתיק אותו יותר.
    expect(plan).toHaveLength(1);
    expect(plan[0]!.payload.pendingTasks.map((t) => t.id)).toEqual(['t1']);
  });

  it('still-dormant user with breakup flag stays silenced', () => {
    const progress = [pendingTaskRow('u-churned')];
    const tenDaysAgo = new Date(now.getTime() - 10 * DAY_MS).toISOString();
    const lastActive = new Map<string, string | null>([['u-churned', tenDaysAgo]]);

    const reengagement = new Map<string, ReengagementUserInfo>([
      [
        'u-churned',
        {
          enabled: true,
          sentMoves: ['breakup'],
          breakupSentAt: new Date(now.getTime() - 1 * DAY_MS).toISOString(),
        },
      ],
    ]);

    const plan = planHabitCheckpointTriggers(
      progress,
      'morning',
      now,
      new Map(),
      lastActive,
      new Map(),
      new Map(),
      reengagement
    );

    // עדיין דורמנטי (10 ימים) + breakup → מושתק (passive-presence מטפל).
    expect(plan).toHaveLength(0);
  });
});
