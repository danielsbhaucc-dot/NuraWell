import { describe, expect, it } from 'vitest';
import { buildDupCandidates, mergeLevel, type DupAssignment, type DupDef } from '@/lib/almog/task-dup-candidates';

const U = '11111111-1111-4111-8111-111111111111';
const def = (o: Partial<DupDef>): DupDef => ({
  title: null, source: 'almog', created_by: 'almog', habit_key: null, step_id: null, ladder: [], floor_level: -2, max_level: 0, schedule: 'daily', ...o,
});
const asg = (id: string, d: Partial<DupDef>, o: Partial<DupAssignment> = {}): DupAssignment => ({
  id, user_id: U, current_level: 0, is_main: false, accepted_at: '2026-10-01T10:00:00Z', legacy_ref: null, definition: def(d), ...o,
});

describe('buildDupCandidates (app port of task_dup_candidates)', () => {
  it('flags tasks sharing a 3+ letter title token, skips unrelated ones', () => {
    const out = buildDupCandidates([
      asg('a1', { title: 'הליכה בבוקר', habit_key: 'almog:a1' }),
      asg('a2', { title: 'הליכה ערב', habit_key: 'almog:a2' }),
      asg('a3', { title: 'שתיית מים', habit_key: 'almog:a3' }),
    ], new Map(), []);
    expect(out).toHaveLength(1);
    expect(out[0].tasks.map((t) => t.id).sort()).toEqual(['a1', 'a2']);
  });

  it('pairs by shared step, orders main first, counts done events', () => {
    const out = buildDupCandidates([
      asg('b1', { title: 'x', step_id: 's1' }),
      asg('b2', { title: 'y', step_id: 's1' }, { is_main: true }),
    ], new Map(), [{ assignment_id: 'b1', kind: 'done', from_level: null, to_level: null, reason: null, source: null, date_key: '2026-10-02', occurred_at: '2026-10-02T08:00:00Z' }]);
    expect(out[0].tasks[0].id).toBe('b2');
    expect(out[0].tasks[1].done).toBe(1);
  });

  it('almog:/ai_daily: habit keys never pair by themselves', () => {
    expect(buildDupCandidates([asg('c1', { title: 'a', habit_key: 'ai_daily:z' }), asg('c2', { title: 'b', habit_key: 'ai_daily:z' })], new Map(), [])).toEqual([]);
  });
});

describe('mergeLevel', () => {
  const keep = { current_level: 0, floor_level: -2, max_level: 1, ladder: [] as unknown };
  it('defaults to the highest level', () => expect(mergeLevel(keep, [1, -1], null)).toBe(1));
  it('clamps to floor/max', () => {
    expect(mergeLevel(keep, [], -5)).toBe(-2);
    expect(mergeLevel(keep, [], 4)).toBe(1);
  });
  it('keeps current when an explicit ladder lacks the level', () =>
    expect(mergeLevel({ ...keep, ladder: [{ level: 0 }, { level: -1 }] }, [], 1)).toBe(0));
});
