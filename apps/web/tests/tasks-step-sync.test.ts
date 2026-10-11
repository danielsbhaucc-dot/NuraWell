import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { ladderFromStepTask } from '../lib/tasks/step-sync';

describe('ladderFromStepTask', () => {
  it('recommended level is 0, easier negative, minimum-viable is the floor, harder positive', () => {
    const r = ladderFromStepTask({
      id: 't1',
      leveling: {
        recommended_level_id: 'b',
        levels: [
          { id: 'c', label: '3 כוסות', order: 3 },
          { id: 'a', label: 'כוס אחת', order: 1, is_minimum_viable: true },
          { id: 'b', label: '2 כוסות', order: 2 },
        ],
      },
    });
    expect(r.ladder.map((l) => [l.level, l.title])).toEqual([[-1, 'כוס אחת'], [0, '2 כוסות'], [1, '3 כוסות']]);
    expect(r.floor).toBe(-1);
    expect(r.max).toBe(1);
  });
  it('no levels → empty ladder (derived default used)', () => {
    expect(ladderFromStepTask({ id: 'x' }).ladder).toEqual([]);
  });
});
