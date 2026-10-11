/**
 * End-to-end flow (server logic): lesson offers task → user accepts → main task in plan →
 * "קשה לי" (step down, floor) → events/streak → Almog autonomous monitor steps back up → AI prompt sees plan.
 */
import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { createFakeSupabase } from './helpers/fake-supabase';
import { applyStepTaskChoices } from '../lib/tasks/step-sync';
import { changeTaskLevel, getPlan, israelDateKey, planForPrompt, recordTaskEvent, runLadderMonitor } from '../lib/tasks';

const USER = 'u-1';
const STEP = 's-1';
const step = {
  id: STEP,
  tasks: [
    {
      id: 't1',
      title: 'שתיית 2 כוסות מים לפני הארוחה',
      emoji: '💧',
      times_per_day: 3,
      leveling: {
        recommended_level_id: 'b',
        levels: [
          { id: 'a', label: 'כוס אחת לפני ארוחה אחת', order: 1, is_minimum_viable: true },
          { id: 'm', label: 'כוס אחת לפני כל ארוחה', order: 2 },
          { id: 'b', label: 'שתיית 2 כוסות מים לפני הארוחה', order: 3 },
        ],
      },
    },
  ],
};

describe('task flow', () => {
  it('lesson → accept → plan → hard → floor → monitor step-up → prompt', async () => {
    const { client, db } = createFakeSupabase({ journey_steps: [step] });

    // decline is respected; then accept makes it the main task
    await applyStepTaskChoices(client, { userId: USER, stepId: STEP, statuses: { t1: { status: 'rejected' } } });
    expect(db.user_task_assignments[0].status).toBe('declined');
    await applyStepTaskChoices(client, { userId: USER, stepId: STEP, statuses: { t1: { status: 'accepted' } } });
    const asg = db.user_task_assignments[0];
    expect(asg).toMatchObject({ status: 'accepted', is_main: true });

    let plan = await getPlan(client, USER);
    expect(plan).toHaveLength(1);
    expect(plan[0].level.title).toBe('שתיית 2 כוסות מים לפני הארוחה');
    expect(plan[0].canStepDown).toBe(true);

    // "קשה לי" → easier level becomes main task; "גם זה קשה לי" → floor; then blocked
    const d1 = await changeTaskLevel(client, { userId: USER, assignmentId: asg.id as string, direction: 'easier', reason: 'קשה לי', source: 'user_button' });
    expect(d1).toMatchObject({ ok: true, to: -1 });
    const d2 = await changeTaskLevel(client, { userId: USER, assignmentId: asg.id as string, direction: 'easier', reason: 'גם זה קשה לי', source: 'user_button' });
    expect(d2).toMatchObject({ ok: true, to: -2 });
    const d3 = await changeTaskLevel(client, { userId: USER, assignmentId: asg.id as string, direction: 'easier', reason: 'עדיין קשה', source: 'chat' });
    expect(d3).toEqual({ ok: false, reason: 'at_floor' });
    expect(db.task_events.filter((e) => e.kind === 'level_change')).toHaveLength(2);
    expect(db.task_events.every((e) => e.kind !== 'level_change' || e.reason)).toBe(true);

    // another user cannot change it
    expect(await changeTaskLevel(client, { userId: 'intruder', assignmentId: asg.id as string, direction: 'harder', reason: 'x', source: 'user_button' })).toMatchObject({ ok: false });

    // 10 consecutive done days after the change → Almog steps up by himself
    asg.last_level_change_at = new Date(Date.now() - 11 * 86_400_000).toISOString();
    for (let i = 0; i < 10; i++) {
      await recordTaskEvent(client, { userId: USER, assignmentId: asg.id as string, kind: 'done', dateKey: israelDateKey(new Date(Date.now() - i * 86_400_000)) });
    }
    plan = await getPlan(client, USER);
    expect(plan[0].streakDays).toBe(10);
    const changes = await runLadderMonitor(client, USER);
    expect(changes).toEqual([expect.objectContaining({ direction: 'harder', from: -2, to: -1 })]);

    plan = await getPlan(client, USER);
    expect(planForPrompt(plan)).toContain('כוס אחת לפני כל ארוחה');
  });
});
