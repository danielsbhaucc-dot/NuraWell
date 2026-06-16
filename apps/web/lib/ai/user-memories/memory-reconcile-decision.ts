import { normalizeFactTextForDedupe } from '../memory-fact-dedupe';
import {
  classifyMemoryReconcileWithLlm,
  type ClassifyMemoryReconcileFn,
  type LlmMemoryReconcileDecision,
} from './classify-memory-reconcile-llm';

/**
 * תצורת LLM ייעודית ל-reconcile זיכרון ברקע (סגירת סשן בלבד).
 * מבודדת מהמודל הראשי של צ'אט אלמוג — ללא משתני סביבה.
 */
export const MEMORY_RECONCILE_LLM_CONFIG = {
  model: 'openai/gpt-4o-mini',
  temperature: 0.05,
  maxTokens: 280,
} as const;

export type MemoryReconcileLlmConfig = typeof MEMORY_RECONCILE_LLM_CONFIG;

export type MemoryCandidate = {
  id: string;
  upstashVectorId: string;
  rowId?: string;
  text: string;
  score: number;
  category: string;
  normalizedText: string;
};

export type MemoryReconcileAction =
  | { type: 'exact_refresh'; target: MemoryCandidate; reasoning?: string }
  | { type: 'merge'; target: MemoryCandidate; mergedText: string; reasoning?: string }
  | { type: 'supersede'; targets: MemoryCandidate[]; updatedText: string; reasoning?: string }
  | { type: 'insert'; reasoning?: string };

export function findExactDuplicateCandidate(
  candidates: MemoryCandidate[],
  normalizedNewText: string
): MemoryCandidate | undefined {
  return candidates.find((c) => c.normalizedText === normalizedNewText);
}

export function findBestSimilarityCandidate(
  candidates: MemoryCandidate[],
  mergeThreshold: number
): MemoryCandidate | undefined {
  return [...candidates]
    .filter((c) => c.score >= mergeThreshold)
    .sort((a, b) => b.score - a.score)[0];
}

/**
 * ממפה החלטת LLM לפעולת reconcile — טהור, נבדק ב-Vitest.
 */
export function mapLlmDecisionToReconcileAction(params: {
  decision: LlmMemoryReconcileDecision;
  newText: string;
  bestCandidate: MemoryCandidate;
}): MemoryReconcileAction {
  const { decision, newText, bestCandidate } = params;
  const cleanNew = newText.replace(/\s+/g, ' ').trim();
  const reasoning = decision.reasoning;

  switch (decision.action) {
    case 'exact':
      return { type: 'exact_refresh', target: bestCandidate, reasoning };
    case 'merge': {
      const mergedText = (decision.updated_text ?? cleanNew).replace(/\s+/g, ' ').trim();
      return { type: 'merge', target: bestCandidate, mergedText, reasoning };
    }
    case 'supersede': {
      const updatedText = (decision.updated_text ?? cleanNew).replace(/\s+/g, ' ').trim();
      return {
        type: 'supersede',
        targets: [bestCandidate],
        updatedText,
        reasoning,
      };
    }
    case 'insert':
    default:
      return { type: 'insert', reasoning };
  }
}

/**
 * מחליט פעולת reconcile: כפילות מילולית מקומית, ואז LLM למועמד דמיון גבוה.
 */
export async function resolveMemoryReconcileAction(params: {
  newText: string;
  candidates: MemoryCandidate[];
  mergeThreshold: number;
  classifyWithLlm?: ClassifyMemoryReconcileFn;
}): Promise<MemoryReconcileAction> {
  const classify = params.classifyWithLlm ?? classifyMemoryReconcileWithLlm;
  const normalizedNewText = normalizeFactTextForDedupe(params.newText);

  const exact = findExactDuplicateCandidate(params.candidates, normalizedNewText);
  if (exact) {
    return { type: 'exact_refresh', target: exact, reasoning: 'normalized_text_exact_match' };
  }

  const best = findBestSimilarityCandidate(params.candidates, params.mergeThreshold);
  if (!best) {
    return { type: 'insert', reasoning: 'no_high_similarity_candidate' };
  }

  const decision = await classify(params.newText, best.text, MEMORY_RECONCILE_LLM_CONFIG);
  return mapLlmDecisionToReconcileAction({
    decision,
    newText: params.newText,
    bestCandidate: best,
  });
}
