import { describe, expect, it } from 'vitest';

import { detectTaskIntent } from '../lib/ai/chat-task-intent';
import { resolveTaskIntentWithHint } from '../lib/ai/task-report-hint';

describe('resolveTaskIntentWithHint', () => {
  it('uses structured hint instead of fuzzy title match', () => {
    const pending = [{ id: 't1', title: 'שתיית מים' }];
    const base = detectTaskIntent('מה קורה?', [{ id: 't2', title: 'הליכה' }]);
    expect(base.taskId).toBeUndefined();

    const resolved = resolveTaskIntentWithHint(
      'סיימתי את «שתיית מים»',
      pending,
      {
        task_id: 't1',
        task_title: 'שתיית מים',
        source: 'home_tasks_popup',
        category: 'done',
      },
      base
    );

    expect(resolved.taskId).toBe('t1');
    expect(resolved.category).toBe('done');
    expect(resolved.confidence).toBe('high');
  });

  it('respects explicit failure even with hint', () => {
    const pending = [{ id: 't1', title: 'שתיית מים' }];
    const base = detectTaskIntent('לא הצלחתי', pending);

    const resolved = resolveTaskIntentWithHint(
      'לא הצלחתי לשתות היום',
      pending,
      {
        task_id: 't1',
        task_title: 'שתיית מים',
        source: 'home_hero',
        category: 'done',
      },
      base
    );

    expect(resolved.category).toBe('failed');
  });
});
