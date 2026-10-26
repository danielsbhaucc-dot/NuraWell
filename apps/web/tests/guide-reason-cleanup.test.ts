import { describe, it, expect } from 'vitest';
import { planGuideCleanup } from '@/lib/tasks/guide-reason-cleanup';

const T = '2026-10-01T10:00:00.000Z';
const at = (ms: number) => new Date(Date.parse(T) + ms).toISOString();

describe('planGuideCleanup', () => {
  it('moves the text to the assignment created with the last offer', () => {
    const p = planGuideCleanup(
      [{ id: 'd1', description: 'x', updated_at: T }],
      [
        { id: 'a-old', user_id: 'u1', definition_id: 'd1', reason: null, created_at: at(-86_400_000) },
        { id: 'a-new', user_id: 'u2', definition_id: 'd1', reason: null, created_at: at(300) },
      ]
    );
    expect(p).toEqual([{ defId: 'd1', move: { asgId: 'a-new', userId: 'u2' } }]);
  });
  it('keeps an existing user reason, skips empty descriptions, flags unmatched', () => {
    const p = planGuideCleanup(
      [
        { id: 'd1', description: 'x', updated_at: T },
        { id: 'd2', description: '  ', updated_at: T },
        { id: 'd3', description: 'y', updated_at: T },
      ],
      [{ id: 'a1', user_id: 'u1', definition_id: 'd1', reason: 'enc', created_at: T }]
    );
    expect(p).toEqual([{ defId: 'd1', keep: true }, { defId: 'd3', unattributed: true }]);
  });
  it('ties are unattributed', () => {
    const p = planGuideCleanup(
      [{ id: 'd1', description: 'x', updated_at: T }],
      [
        { id: 'a1', user_id: 'u1', definition_id: 'd1', reason: null, created_at: at(1000) },
        { id: 'a2', user_id: 'u2', definition_id: 'd1', reason: null, created_at: at(-1000) },
      ]
    );
    expect(p[0].unattributed).toBe(true);
  });
});
