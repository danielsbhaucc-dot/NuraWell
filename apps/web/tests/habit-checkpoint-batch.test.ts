import { describe, expect, it } from 'vitest';

import {
  allowedSlotsForCadenceStage,
  appendPresenceReinforceFromChat,
  collectCompletedAcceptedTasks,
  collectPendingAcceptedTasks,
  computeCadenceStage,
  computeNudgeLevel,
  isSlotAllowedForCadenceStage,
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

/**
 * Helper: lastActiveByUser שמסמן את כל המשתמשים כ-active (פעילים היום) ב-tests.
 * בלי זה — בהיעדר Map, daysSinceLastActive=Infinity → cadence='ghosted', מה
 * שמוסיף "dormancy touch" בבוקר. אנחנו רוצים לבדוק את ההתנהגות של משתמש פעיל
 * מובהק אלא אם הטסט מתייחס במפורש ל-cadence dormant.
 */
function activeLastActive(...userIds: string[]): Map<string, string | null> {
  const today = new Date('2026-05-19T08:00:00.000Z').toISOString();
  return new Map(userIds.map((uid) => [uid, today]));
}

const DAY_MS = 24 * 60 * 60 * 1000;

describe('planHabitCheckpointTriggers', () => {
  it('silent when all habits already marked done today (no reinforce)', () => {
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

    /** דרישת מוצר: הכל בוצע ואין משימות פתוחות → שקט מוחלט (משתמש active). */
    const plan = planHabitCheckpointTriggers(
      progress,
      'morning',
      new Date('2026-05-19T06:00:00+03:00'),
      new Map(),
      activeLastActive('u1')
    );
    expect(plan).toHaveLength(0);
  });

  it('silent when all habits and tasks done — no morning reinforce', () => {
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

    /** דרישת מוצר: הכל בוצע ואין פתוחים → אין הודעה גם בבוקר (משתמש active). */
    const plan = planHabitCheckpointTriggers(
      progress,
      'morning',
      new Date('2026-05-19T06:00:00+03:00'),
      new Map(),
      activeLastActive('u1')
    );
    expect(plan).toHaveLength(0);
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
      'morning',
      new Date('2026-05-19T08:00:00.000Z'),
      new Map(),
      activeLastActive('u1')
    );
    expect(plan).toHaveLength(1);
    expect(plan[0]!.payload.notifyMode).toBe('remind');
    expect(plan[0]!.payload.pendingTasks.map((t) => t.id)).toEqual(['t2']);
  });

  it('drops recurring task from pending when all slots done today', () => {
    const progress: ProgressRow[] = [
      row({
        user_id: 'u1',
        task_statuses: {
          t_recur: { status: 'accepted', execution_done: false },
        },
        journey_steps: {
          title: 'צעד',
          habits: [],
          tasks: [
            {
              id: 't_recur',
              title: 'שתיית מים לפני כל ארוחה',
              schedule: 'per_meal',
              times_per_day: 3,
            },
          ],
          journey_stations: null,
        },
      }),
    ];

    const todayDoneByTask = new Map<string, Set<string>>([
      ['t_recur', new Set(['meal_breakfast', 'meal_lunch', 'meal_dinner'])],
    ]);

    expect(
      collectPendingAcceptedTasks(progress, {
        todayDoneByTask,
        cronSlot: 'evening',
        jerusalemWeekday: 1,
      })
    ).toEqual([]);

    expect(
      collectCompletedAcceptedTasks(progress, {
        todayDoneByTask,
        jerusalemWeekday: 1,
      })
    ).toEqual([{ id: 't_recur', title: 'שתיית מים לפני כל ארוחה' }]);
  });

  it('keeps recurring task pending and reports remaining slots', () => {
    const progress: ProgressRow[] = [
      row({
        user_id: 'u1',
        task_statuses: {
          t_recur: { status: 'accepted', execution_done: false },
        },
        journey_steps: {
          title: 'צעד',
          habits: [],
          tasks: [
            {
              id: 't_recur',
              title: 'שתיית מים',
              schedule: 'multi_daily',
              times_per_day: 3,
            },
          ],
          journey_stations: null,
        },
      }),
    ];

    const todayDoneByTask = new Map<string, Set<string>>([
      ['t_recur', new Set(['morning'])],
    ]);

    const pending = collectPendingAcceptedTasks(progress, {
      todayDoneByTask,
      cronSlot: 'midday',
      jerusalemWeekday: 1,
    });
    expect(pending).toHaveLength(1);
    expect(pending[0]!.id).toBe('t_recur');
    expect(pending[0]!.pendingSlots).toEqual(['noon', 'evening']);
  });

  it('per_meal cron-slot match: drops when current meal already marked', () => {
    const progress: ProgressRow[] = [
      row({
        user_id: 'u1',
        task_statuses: {
          t_meal: { status: 'accepted', execution_done: false },
        },
        journey_steps: {
          title: 'צעד',
          habits: [],
          tasks: [
            {
              id: 't_meal',
              title: 'מים לפני ארוחת בוקר',
              schedule: 'per_meal',
              times_per_day: 3,
            },
          ],
          journey_stations: null,
        },
      }),
    ];

    const todayDoneByTask = new Map<string, Set<string>>([
      ['t_meal', new Set(['meal_breakfast'])],
    ]);

    const pendingMorning = collectPendingAcceptedTasks(progress, {
      todayDoneByTask,
      cronSlot: 'morning',
      jerusalemWeekday: 1,
    });
    expect(pendingMorning).toEqual([]);

    const pendingMidday = collectPendingAcceptedTasks(progress, {
      todayDoneByTask,
      cronSlot: 'midday',
      jerusalemWeekday: 1,
    });
    expect(pendingMidday).toHaveLength(1);
    expect(pendingMidday[0]!.pendingSlots).toEqual(['meal_lunch', 'meal_dinner']);
  });

  it('adds presence reinforce in morning when user chatted today and nothing to remind', () => {
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
      'morning',
      new Date('2026-05-19T08:00:00+03:00')
    );
    /**
     * morning + daily habit not done → fires as remind, לא presence.
     * הטסט נשאר רלוונטי אבל ה-base ידחוף לטוב יחיד, presence לא יוסף.
     */
    expect(base).toHaveLength(1);
    expect(base[0]!.payload.notifyMode).toBe('remind');

    const noNew = appendPresenceReinforceFromChat(
      base,
      progress,
      'morning',
      new Date('2026-05-19T08:00:00+03:00'),
      new Set(['u-chat'])
    );
    expect(noNew).toHaveLength(1);
  });

  it('does NOT add presence reinforce in midday/evening even with chat', () => {
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
    const baseMidday = planHabitCheckpointTriggers(
      progress,
      'midday',
      new Date('2026-05-19T13:00:00+03:00')
    );
    expect(baseMidday).toHaveLength(0);

    const noPresenceMidday = appendPresenceReinforceFromChat(
      baseMidday,
      progress,
      'midday',
      new Date('2026-05-19T13:00:00+03:00'),
      new Set(['u-chat'])
    );
    expect(noPresenceMidday).toHaveLength(0);

    const baseEvening = planHabitCheckpointTriggers(
      progress,
      'evening',
      new Date('2026-05-19T20:00:00+03:00')
    );
    const noPresenceEvening = appendPresenceReinforceFromChat(
      baseEvening,
      progress,
      'evening',
      new Date('2026-05-19T20:00:00+03:00'),
      new Set(['u-chat'])
    );
    expect(noPresenceEvening).toHaveLength(0);
  });

  it('cadence stage maps days correctly', () => {
    expect(computeCadenceStage(0)).toBe('active');
    expect(computeCadenceStage(1)).toBe('active');
    expect(computeCadenceStage(2)).toBe('active');
    expect(computeCadenceStage(3)).toBe('dormant_early');
    expect(computeCadenceStage(7)).toBe('dormant_early');
    expect(computeCadenceStage(8)).toBe('withdrawing');
    expect(computeCadenceStage(9)).toBe('extended_absence');
    expect(computeCadenceStage(13)).toBe('extended_absence');
    expect(computeCadenceStage(14)).toBe('ghosted');
    expect(computeCadenceStage(30)).toBe('ghosted');
    expect(computeCadenceStage(Infinity)).toBe('ghosted');
  });

  it('cadence stage allows the right slots per stage', () => {
    expect([...allowedSlotsForCadenceStage('active')].sort()).toEqual(
      ['evening', 'midday', 'morning'].sort()
    );
    expect([...allowedSlotsForCadenceStage('dormant_early')].sort()).toEqual(
      ['evening', 'morning'].sort()
    );
    expect([...allowedSlotsForCadenceStage('withdrawing')]).toEqual(['morning']);
    expect([...allowedSlotsForCadenceStage('extended_absence')]).toEqual(['midday']);
    expect([...allowedSlotsForCadenceStage('ghosted')]).toEqual(['morning']);
  });

  it('nudge level remaps to new cadence thresholds (14+ ghosted)', () => {
    expect(computeNudgeLevel(0)).toBe(0);
    expect(computeNudgeLevel(2)).toBe(0);
    expect(computeNudgeLevel(3)).toBe(1);
    expect(computeNudgeLevel(7)).toBe(1);
    expect(computeNudgeLevel(8)).toBe(2);
    expect(computeNudgeLevel(13)).toBe(2);
    expect(computeNudgeLevel(14)).toBe(3);
  });

  it('pending task overrides cadence stage — sends in all 3 slots even when dormant_early', () => {
    const progress: ProgressRow[] = [
      row({
        user_id: 'u-dormant',
        task_statuses: {
          t1: { status: 'accepted', execution_done: false },
        },
        journey_steps: {
          title: 'צעד',
          habits: [],
          tasks: [{ id: 't1', title: 'משימה פתוחה' }],
          journey_stations: null,
        },
      }),
    ];

    /**
     * דרישת מוצר: משימה לא בוצעת → 3 תזכורות ביום, גם במצב dormant_early.
     * cadence מצויין ב-payload לטון, אבל לא חוסם שליחה.
     */
    const now = new Date('2026-05-19T08:00:00.000Z');
    const fiveDaysAgo = new Date(now.getTime() - 5 * DAY_MS).toISOString();
    const lastActive = new Map<string, string | null>([['u-dormant', fiveDaysAgo]]);

    const planMidday = planHabitCheckpointTriggers(
      progress,
      'midday',
      now,
      new Map(),
      lastActive
    );
    expect(planMidday).toHaveLength(1);
    expect(planMidday[0]!.payload.notifyMode).toBe('remind');
    expect(planMidday[0]!.payload.cadenceStage).toBe('dormant_early');

    const planMorning = planHabitCheckpointTriggers(
      progress,
      'morning',
      now,
      new Map(),
      lastActive
    );
    expect(planMorning).toHaveLength(1);
    expect(planMorning[0]!.payload.notifyMode).toBe('remind');
    expect(planMorning[0]!.payload.cadenceStage).toBe('dormant_early');
  });

  it('withdrawing (day 8) — only morning, with empathetic touch even without open work', () => {
    const progress: ProgressRow[] = [
      row({
        user_id: 'u-withdraw',
        journey_steps: {
          title: 'צעד',
          habits: [{ id: 'h1', title: 'מים', frequency: 'daily' }],
          tasks: [],
          journey_stations: null,
        },
      }),
    ];

    /** בדיוק 8 ימים לפי daysBetween, בלי תלות ב-timezone של הסביבה. */
    const now = new Date('2026-05-19T08:00:00.000Z');
    const eightDaysAgo = new Date(now.getTime() - 8 * DAY_MS).toISOString();
    const lastActive = new Map<string, string | null>([['u-withdraw', eightDaysAgo]]);

    const morning = planHabitCheckpointTriggers(
      progress,
      'morning',
      now,
      new Map(),
      lastActive
    );
    expect(morning).toHaveLength(1);
    expect(morning[0]!.payload.cadenceStage).toBe('withdrawing');

    const midday = planHabitCheckpointTriggers(
      progress,
      'midday',
      now,
      new Map(),
      lastActive
    );
    expect(midday).toHaveLength(0);

    const evening = planHabitCheckpointTriggers(
      progress,
      'evening',
      now,
      new Map(),
      lastActive
    );
    expect(evening).toHaveLength(0);
  });

  it('extended_absence (9-13) — habit due overrides cadence; only dormancy-touch in allowed slot otherwise', () => {
    const progress: ProgressRow[] = [
      row({
        user_id: 'u-ext',
        journey_steps: {
          title: 'צעד',
          habits: [{ id: 'h1', title: 'מים', frequency: 'daily' }],
          tasks: [],
          journey_stations: null,
        },
      }),
    ];

    const now = new Date('2026-05-19T08:00:00.000Z');
    const tenDaysAgo = new Date(now.getTime() - 10 * DAY_MS).toISOString();
    const lastActive = new Map<string, string | null>([['u-ext', tenDaysAgo]]);

    /**
     * midday עם הרגל פתוח לא תואם slot (daily → רק בוקר) אבל cadenceStage=extended_absence
     * מאפשר midday → dormancy presence touch.
     */
    const midday = planHabitCheckpointTriggers(
      progress,
      'midday',
      now,
      new Map(),
      lastActive
    );
    expect(midday).toHaveLength(1);
    expect(midday[0]!.payload.cadenceStage).toBe('extended_absence');
    expect(midday[0]!.payload.notifyMode).toBe('reinforce');
    expect(midday[0]!.payload.reinforceKind).toBe('presence');

    /**
     * morning יש הרגל יומי לא בוצע → due ולא ריק → remind בלי תלות ב-cadence.
     * דרישת מוצר: משימה/הרגל פתוח → 3 תזכורות ביום.
     */
    const morning = planHabitCheckpointTriggers(
      progress,
      'morning',
      now,
      new Map(),
      lastActive
    );
    expect(morning).toHaveLength(1);
    expect(morning[0]!.payload.notifyMode).toBe('remind');
  });

  it('isSlotAllowedForCadenceStage utility', () => {
    expect(isSlotAllowedForCadenceStage('morning', 'active')).toBe(true);
    expect(isSlotAllowedForCadenceStage('midday', 'dormant_early')).toBe(false);
    expect(isSlotAllowedForCadenceStage('evening', 'withdrawing')).toBe(false);
    expect(isSlotAllowedForCadenceStage('midday', 'extended_absence')).toBe(true);
    expect(isSlotAllowedForCadenceStage('morning', 'ghosted')).toBe(true);
  });

  it('fully done + no open work → silence in ALL 3 slots (no reinforce)', () => {
    const progress: ProgressRow[] = [
      row({
        user_id: 'u-done',
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
    const active = activeLastActive('u-done');

    /**
     * דרישת מוצר: אם המשימה בוצעה ואין משימות אחרות פתוחות → אין הודעה.
     * משתמש active → ללא dormancy touch → שקט מוחלט ב-3 ה-slots.
     */
    const morning = planHabitCheckpointTriggers(
      progress,
      'morning',
      new Date('2026-05-19T08:00:00+03:00'),
      new Map(),
      active
    );
    expect(morning).toHaveLength(0);

    const midday = planHabitCheckpointTriggers(
      progress,
      'midday',
      new Date('2026-05-19T13:00:00+03:00'),
      new Map(),
      active
    );
    expect(midday).toHaveLength(0);

    const evening = planHabitCheckpointTriggers(
      progress,
      'evening',
      new Date('2026-05-19T20:00:00+03:00'),
      new Map(),
      active
    );
    expect(evening).toHaveLength(0);
  });

  it('pending one-time task → 3 reminders/day (morning + midday + evening)', () => {
    const progress: ProgressRow[] = [
      row({
        user_id: 'u-pending',
        task_statuses: {
          t1: { status: 'accepted', execution_done: false },
        },
        journey_steps: {
          title: 'צעד',
          habits: [],
          tasks: [{ id: 't1', title: 'להגיש דוח' }],
          journey_stations: null,
        },
      }),
    ];
    const active = activeLastActive('u-pending');

    const morning = planHabitCheckpointTriggers(
      progress,
      'morning',
      new Date('2026-05-19T08:00:00+03:00'),
      new Map(),
      active
    );
    const midday = planHabitCheckpointTriggers(
      progress,
      'midday',
      new Date('2026-05-19T13:00:00+03:00'),
      new Map(),
      active
    );
    const evening = planHabitCheckpointTriggers(
      progress,
      'evening',
      new Date('2026-05-19T20:00:00+03:00'),
      new Map(),
      active
    );

    expect(morning).toHaveLength(1);
    expect(morning[0]!.payload.notifyMode).toBe('remind');
    expect(midday).toHaveLength(1);
    expect(midday[0]!.payload.notifyMode).toBe('remind');
    expect(evening).toHaveLength(1);
    expect(evening[0]!.payload.notifyMode).toBe('remind');
  });

  it('partially-done multi_daily task → still remind with pending slots in payload', () => {
    const progress: ProgressRow[] = [
      row({
        user_id: 'u-partial',
        task_statuses: {
          t_recur: { status: 'accepted', execution_done: false },
        },
        journey_steps: {
          title: 'צעד',
          habits: [],
          tasks: [
            {
              id: 't_recur',
              title: 'שתיית מים',
              schedule: 'multi_daily',
              times_per_day: 3,
            },
          ],
          journey_stations: null,
        },
      }),
    ];

    /** המשתמש סימן רק בוקר. midday עדיין יציג noon+evening כפתוחים. */
    const todayDoneByTask = new Map<string, Set<string>>([
      ['t_recur', new Set(['morning'])],
    ]);

    const midday = planHabitCheckpointTriggers(
      progress,
      'midday',
      new Date('2026-05-19T13:00:00+03:00'),
      todayDoneByTask,
      activeLastActive('u-partial')
    );
    expect(midday).toHaveLength(1);
    expect(midday[0]!.payload.notifyMode).toBe('remind');
    expect(midday[0]!.payload.pendingTasks[0]!.pendingSlotLabels).toEqual([
      'צהריים',
      'ערב',
    ]);
  });
});
