import { describe, expect, it } from 'vitest';

import {
  decideMemoryReconcileAction,
  findExactDuplicateCandidate,
  heuristicMemoryRelationship,
  type MemoryCandidate,
  type MemoryRelationship,
} from '../lib/ai/user-memories/memory-reconcile-decision';
import { SIMILARITY_MERGE_THRESHOLD } from '../lib/ai/rag-config';

function candidate(
  partial: Partial<MemoryCandidate> & Pick<MemoryCandidate, 'id' | 'text' | 'score'>
): MemoryCandidate {
  return {
    upstashVectorId: partial.id,
    rowId: partial.rowId,
    category: partial.category ?? 'goal',
    normalizedText: partial.normalizedText ?? partial.text.toLowerCase(),
    ...partial,
  };
}

describe('heuristicMemoryRelationship', () => {
  it('detects exact duplicate', () => {
    expect(heuristicMemoryRelationship('רוצה לרדת 5 קילו', 'רוצה לרדת 5 קילו')).toBe('exact');
  });

  it('detects contradiction between opposing goals', () => {
    expect(heuristicMemoryRelationship('מטרה: לרדת במשקל', 'מטרה: לעלות במשקל')).toBe(
      'contradiction'
    );
  });

  it('detects contradiction between vegetarian and meat', () => {
    expect(heuristicMemoryRelationship('אני צמחוני', 'אוכל בשר בערב')).toBe('contradiction');
  });

  it('suggests merge for overlapping phrasing', () => {
    const rel = heuristicMemoryRelationship(
      'קשה לי בערבים אחרי יום עבודה ארוך',
      'בערבים אחרי יום עבודה ארוך יש פיצוחים'
    );
    expect(rel).toBe('merge');
  });
});

describe('decideMemoryReconcileAction', () => {
  it('returns exact_refresh for normalized duplicate', () => {
    const candidates = [
      candidate({
        id: 'vec-1',
        text: 'דפוס פיצוח בערב',
        score: 0.95,
        normalizedText: 'דפוס פיצוח בערב',
      }),
    ];

    const action = decideMemoryReconcileAction({
      newText: 'דפוס פיצוח בערב',
      candidates,
      relationshipByTargetId: new Map(),
      mergeThreshold: SIMILARITY_MERGE_THRESHOLD,
    });

    expect(action.type).toBe('exact_refresh');
    if (action.type === 'exact_refresh') {
      expect(action.target.id).toBe('vec-1');
    }
  });

  it('returns merge when relationship is merge and score is high', () => {
    const candidates = [
      candidate({
        id: 'vec-2',
        text: 'קשה בסופי שבוע בערב',
        score: 0.91,
      }),
    ];
    const rel = new Map<string, MemoryRelationship>([['vec-2', 'merge']]);

    const action = decideMemoryReconcileAction({
      newText: 'קשה בשבת בערב אחרי מסיבה',
      candidates,
      relationshipByTargetId: rel,
      mergeThreshold: SIMILARITY_MERGE_THRESHOLD,
    });

    expect(action.type).toBe('merge');
  });

  it('returns supersede when new fact contradicts similar memory', () => {
    const candidates = [
      candidate({
        id: 'vec-old',
        text: 'מטרה: לרדת 8 קילו עד הקיץ',
        score: 0.9,
      }),
    ];
    const rel = new Map<string, MemoryRelationship>([['vec-old', 'contradiction']]);

    const action = decideMemoryReconcileAction({
      newText: 'מטרה: לעלות במשקל ולבנות שריר',
      candidates,
      relationshipByTargetId: rel,
      mergeThreshold: SIMILARITY_MERGE_THRESHOLD,
    });

    expect(action.type).toBe('supersede');
    if (action.type === 'supersede') {
      expect(action.targets.map((t) => t.id)).toEqual(['vec-old']);
    }
  });

  it('returns insert when no similar candidates', () => {
    const action = decideMemoryReconcileAction({
      newText: 'מעדיף אימונים בבוקר',
      candidates: [
        candidate({ id: 'vec-low', text: 'אוהב יוגה', score: 0.4 }),
      ],
      relationshipByTargetId: new Map(),
      mergeThreshold: SIMILARITY_MERGE_THRESHOLD,
    });

    expect(action.type).toBe('insert');
  });

  it('findExactDuplicateCandidate matches normalized text', () => {
    const hit = findExactDuplicateCandidate(
      [candidate({ id: 'a', text: 'יעד: שתיית מים', score: 0.5, normalizedText: 'יעד: שתיית מים' })],
      'יעד: שתיית מים'
    );
    expect(hit?.id).toBe('a');
  });
});
