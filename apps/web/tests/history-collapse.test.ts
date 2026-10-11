import { describe, expect, it } from 'vitest';
import { collapseHistory } from '../lib/tasks/history-collapse';

const mk = (id: string, title: string, at: string, kind = 'level_change') => ({ id, taskTitle: title, kind, fromLevel: 0, toLevel: -1, reason: null, at });
describe('collapseHistory', () => {
  it('collapses same task/kind/day (normalized title) and keeps different days apart', () => {
    const r = collapseHistory([
      mk('1', 'שתיית 2 כוסות מים לפני הארוחה', '2026-10-11T10:00:00Z'),
      mk('2', 'שתיית 2 כוסות מים לפני הארוחה ', '2026-10-11T09:00:00Z'),
      mk('3', 'שתיית 2 כוסות מים לפני הארוחה!', '2026-10-11T08:00:00Z'),
      mk('4', 'שתיית 2 כוסות מים לפני הארוחה', '2026-10-10T08:00:00Z'),
      mk('5', 'הליכה', '2026-10-11T08:00:00Z'),
    ]);
    expect(r.map((x) => [x.id, x.count])).toEqual([['1', 3], ['4', 1], ['5', 1]]);
  });
});
