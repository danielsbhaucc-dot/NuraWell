import { describe, expect, it } from 'vitest';
import { shrinkTaskTitle, tinyStepTitle } from '../lib/ai/orchestrator/shrink-task-title';

describe('shrinkTaskTitle', () => {
  it('halves cups to a natural "one cup" phrase', () => {
    expect(shrinkTaskTitle('שתיה של 2 כוסות מים לפני צהריים')).toBe('שתיה של כוס מים אחת לפני צהריים');
  });
  it('halves minutes', () => {
    expect(shrinkTaskTitle('הליכה של 20 דקות אחרי ארוחת ערב')).toBe('הליכה של 10 דקות אחרי ארוחת ערב');
  });
  it('keeps the noun with larger counts', () => {
    expect(shrinkTaskTitle('לשתות 8 כוסות מים ביום')).toBe('לשתות 4 כוסות מים ביום');
  });
  it('masculine units', () => {
    expect(shrinkTaskTitle('לאכול 2 פירות ביום')).toBe('לאכול פרי אחד ביום');
  });
  it('returns null when nothing is measurable', () => {
    expect(shrinkTaskTitle('לאכול ארוחת בוקר')).toBeNull();
    expect(shrinkTaskTitle('כוס 1 מים')).toBeNull();
  });
  it('tinyStepTitle never uses the awkward generic phrasing', () => {
    expect(tinyStepTitle('לאכול ארוחת בוקר')).not.toMatch(/גרסה זעירה/);
    expect(tinyStepTitle('שתיה של 2 כוסות מים לפני צהריים')).toBe('שתיה של כוס מים אחת לפני צהריים');
  });
});

import { buildUserTaskSnapshot } from '../lib/tasks/user-task-ssot';

describe('parked original is not a second open task', () => {
  it('hides a frozen parent that has an active eases child', () => {
    const snap = buildUserTaskSnapshot({
      steps: [],
      almogAssignments: [
        { id: 'p', title: 'שתיה של 2 כוסות מים לפני צהריים', status: 'frozen', schedule: 'daily' },
        { id: 'c', title: 'שתיה של כוס מים אחת לפני צהריים', status: 'active', schedule: 'daily', parent_assignment_id: 'p' },
        { id: 'x', title: 'הליכה של 10 דקות', status: 'frozen', schedule: 'daily' },
      ],
    });
    expect(snap.counts.almog.active).toBe(2);
  });
});
