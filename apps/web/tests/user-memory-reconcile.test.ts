import { describe, expect, it, vi } from 'vitest';

import {
  fallbackMemoryReconcileDecision,
  parseLlmMemoryReconcilePayload,
  type LlmMemoryReconcileDecision,
} from '../lib/ai/user-memories/classify-memory-reconcile-llm';
import {
  findExactDuplicateCandidate,
  mapLlmDecisionToReconcileAction,
  MEMORY_RECONCILE_LLM_CONFIG,
  resolveMemoryReconcileAction,
  type MemoryCandidate,
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

describe('parseLlmMemoryReconcilePayload', () => {
  it('parses valid JSON with markdown fences', () => {
    const raw = '```json\n{"action":"supersede","updated_text":"אוכל בשר לעיתים","reasoning":"סתירה לטבעונות"}\n```';
    const parsed = parseLlmMemoryReconcilePayload(raw);
    expect(parsed?.action).toBe('supersede');
    expect(parsed?.updated_text).toBe('אוכל בשר לעיתים');
  });

  it('returns null for invalid payload', () => {
    expect(parseLlmMemoryReconcilePayload('not json')).toBeNull();
  });
});

describe('mapLlmDecisionToReconcileAction', () => {
  const best = candidate({
    id: 'vec-old',
    text: 'טבעוני קפדני',
    score: 0.94,
  });

  it('maps supersede with updated_text for dietary contradiction', () => {
    const decision: LlmMemoryReconcileDecision = {
      action: 'supersede',
      updated_text: 'אוכל בשר בערב בסופי שבוע',
      reasoning: 'העדפה תזונתית השתנתה — מחליף את הטבעונות',
    };

    const action = mapLlmDecisionToReconcileAction({
      decision,
      newText: 'אוכל בשר בערב בסופי שבוע',
      bestCandidate: best,
    });

    expect(action.type).toBe('supersede');
    if (action.type === 'supersede') {
      expect(action.targets[0]?.id).toBe('vec-old');
      expect(action.updatedText).toBe('אוכל בשר בערב בסופי שבוע');
    }
  });

  it('maps merge with combined updated_text', () => {
    const action = mapLlmDecisionToReconcileAction({
      decision: {
        action: 'merge',
        updated_text: 'קשה בערבים אחרי יום עבודה — במיוחד בסופי שבוע',
        reasoning: 'משלימים דפוסים',
      },
      newText: 'בסופי שבוע יש פיצוחים',
      bestCandidate: candidate({ id: 'v1', text: 'קשה בערבים אחרי עבודה', score: 0.9 }),
    });

    expect(action.type).toBe('merge');
    if (action.type === 'merge') {
      expect(action.mergedText).toContain('סופי שבוע');
    }
  });

  it('maps insert for unrelated topics despite vector similarity', () => {
    const action = mapLlmDecisionToReconcileAction({
      decision: {
        action: 'insert',
        reasoning: 'נושאים שונים — העדפת אימון מול הרגלי שינה',
      },
      newText: 'מעדיף אימונים בבוקר',
      bestCandidate: candidate({ id: 'v2', text: 'יש לי קושי להירדם', score: 0.89 }),
    });

    expect(action.type).toBe('insert');
  });
});

describe('resolveMemoryReconcileAction', () => {
  it('skips LLM for normalized exact duplicate', async () => {
    const classify = vi.fn();
    const action = await resolveMemoryReconcileAction({
      newText: 'דפוס פיצוח בערב',
      candidates: [
        candidate({
          id: 'vec-1',
          text: 'דפוס פיצוח בערב',
          score: 0.95,
          normalizedText: 'דפוס פיצוח בערב',
        }),
      ],
      mergeThreshold: SIMILARITY_MERGE_THRESHOLD,
      classifyWithLlm: classify,
    });

    expect(action.type).toBe('exact_refresh');
    expect(classify).not.toHaveBeenCalled();
  });

  it('skips LLM when no high-similarity candidate', async () => {
    const classify = vi.fn();
    const action = await resolveMemoryReconcileAction({
      newText: 'מעדיף אימונים בבוקר',
      candidates: [candidate({ id: 'vec-low', text: 'אוהב יוגה', score: 0.4 })],
      mergeThreshold: SIMILARITY_MERGE_THRESHOLD,
      classifyWithLlm: classify,
    });

    expect(action.type).toBe('insert');
    expect(classify).not.toHaveBeenCalled();
  });

  it('awaits LLM for high-similarity candidate (vegan vs meat paradox)', async () => {
    const classify = vi.fn().mockResolvedValue({
      action: 'supersede',
      updated_text: 'אוכל בשר בערב',
      reasoning: 'סתירה לוגית למרות דמיון נושאי',
    } satisfies LlmMemoryReconcileDecision);

    const action = await resolveMemoryReconcileAction({
      newText: 'אוכל בשר בערב',
      candidates: [
        candidate({
          id: 'vec-vegan',
          text: 'טבעוני קפדני',
          score: 0.92,
        }),
      ],
      mergeThreshold: SIMILARITY_MERGE_THRESHOLD,
      classifyWithLlm: classify,
    });

    expect(classify).toHaveBeenCalledWith(
      'אוכל בשר בערב',
      'טבעוני קפדני',
      MEMORY_RECONCILE_LLM_CONFIG
    );
    expect(action.type).toBe('supersede');
    if (action.type === 'supersede') {
      expect(action.targets[0]?.id).toBe('vec-vegan');
      expect(action.updatedText).toBe('אוכל בשר בערב');
    }
  });

  it('uses LLM merge decision instead of heuristics', async () => {
    const classify = vi.fn().mockResolvedValue({
      action: 'merge',
      updated_text: 'קשה בערבים ובסופי שבוע אחרי ימים עמוסים',
      reasoning: 'אותו דפוס עם פירוט',
    } satisfies LlmMemoryReconcileDecision);

    const action = await resolveMemoryReconcileAction({
      newText: 'בסופי שבוע זה מחריף',
      candidates: [
        candidate({ id: 'vec-evening', text: 'קשה בערבים אחרי עבודה', score: 0.91 }),
      ],
      mergeThreshold: SIMILARITY_MERGE_THRESHOLD,
      classifyWithLlm: classify,
    });

    expect(action.type).toBe('merge');
    if (action.type === 'merge') {
      expect(action.mergedText).toContain('סופי שבוע');
    }
  });

  it('findExactDuplicateCandidate matches normalized text', () => {
    const hit = findExactDuplicateCandidate(
      [candidate({ id: 'a', text: 'יעד: שתיית מים', score: 0.5, normalizedText: 'יעד: שתיית מים' })],
      'יעד: שתיית מים'
    );
    expect(hit?.id).toBe('a');
  });

  it('fallback decision defaults to insert', () => {
    expect(fallbackMemoryReconcileDecision('parse_fail').action).toBe('insert');
  });
});
