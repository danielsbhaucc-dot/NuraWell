import { normalizeFactTextForDedupe } from '../memory-fact-dedupe';

export type MemoryCandidate = {
  id: string;
  upstashVectorId: string;
  rowId?: string;
  text: string;
  score: number;
  category: string;
  normalizedText: string;
};

export type MemoryRelationship = 'exact' | 'merge' | 'contradiction' | 'unrelated';

export type MemoryReconcileAction =
  | { type: 'exact_refresh'; target: MemoryCandidate }
  | { type: 'merge'; target: MemoryCandidate }
  | { type: 'supersede'; targets: MemoryCandidate[] }
  | { type: 'insert' };

/** זוגות נושאים מנוגדים נפוצים בליווי בריאות */
const CONTRADICTION_TOPIC_PAIRS: ReadonlyArray<readonly [RegExp, RegExp]> = [
  [/צמחונ|טבעונ|vegan/i, /אוכל בשר|בשר|בקר|עוף/i],
  [/לרדת במשקל|להוריד משקל|לרזות/i, /לעלות במשקל|לגדול במשקל|לעלות בקילו/i],
  [/בלי סוכר|ללא סוכר|פחות סוכר/i, /אוהב סוכר|מתוקים|עם סוכר/i],
  [/אין לי זמן|אין זמן לאימון/i, /מתאמן כל יום|אימון יומי/i],
];

const NEGATION_PREFIX = /^(לא |אין |בלי |ללא )/i;

/**
 * היוריסטיקה טהורה לזיהוי סתירה/מיזוג — נבדקת ב-Vitest ללא LLM.
 */
export function heuristicMemoryRelationship(oldText: string, newText: string): MemoryRelationship {
  const normOld = normalizeFactTextForDedupe(oldText);
  const normNew = normalizeFactTextForDedupe(newText);
  if (!normOld || !normNew) return 'unrelated';
  if (normOld === normNew) return 'exact';

  if (normOld.includes(normNew) || normNew.includes(normOld)) {
    return 'merge';
  }

  for (const [a, b] of CONTRADICTION_TOPIC_PAIRS) {
    const oldA = a.test(oldText);
    const oldB = b.test(oldText);
    const newA = a.test(newText);
    const newB = b.test(newText);
    if ((oldA && newB) || (oldB && newA)) return 'contradiction';
  }

  const oldNeg = NEGATION_PREFIX.test(oldText.trim());
  const newNeg = NEGATION_PREFIX.test(newText.trim());
  if (oldNeg !== newNeg) {
    const oldCore = oldText.replace(NEGATION_PREFIX, '').trim();
    const newCore = newText.replace(NEGATION_PREFIX, '').trim();
    if (
      normalizeFactTextForDedupe(oldCore).includes(normalizeFactTextForDedupe(newCore).slice(0, 12)) ||
      normalizeFactTextForDedupe(newCore).includes(normalizeFactTextForDedupe(oldCore).slice(0, 12))
    ) {
      return 'contradiction';
    }
  }

  if (oldText.length > 12 && newText.length > 12) {
    const oldWords = new Set(normOld.split(' ').filter((w) => w.length > 2));
    const newWords = new Set(normNew.split(' ').filter((w) => w.length > 2));
    let overlap = 0;
    for (const w of oldWords) {
      if (newWords.has(w)) overlap += 1;
    }
    const union = new Set([...oldWords, ...newWords]).size;
    if (union > 0 && overlap / union >= 0.45) return 'merge';
  }

  return 'unrelated';
}

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
 * מחליט פעולת reconcile לעובדה חדשה מול מועמדים קיימים.
 */
export function decideMemoryReconcileAction(params: {
  newText: string;
  candidates: MemoryCandidate[];
  relationshipByTargetId: Map<string, MemoryRelationship>;
  mergeThreshold: number;
}): MemoryReconcileAction {
  const normalizedNewText = normalizeFactTextForDedupe(params.newText);
  const exact = findExactDuplicateCandidate(params.candidates, normalizedNewText);
  if (exact) return { type: 'exact_refresh', target: exact };

  const best = findBestSimilarityCandidate(params.candidates, params.mergeThreshold);
  if (!best) return { type: 'insert' };

  const relationship =
    params.relationshipByTargetId.get(best.upstashVectorId) ??
    heuristicMemoryRelationship(best.text, params.newText);

  if (relationship === 'contradiction') {
    const conflicting = params.candidates.filter((c) => {
      if (c.score < params.mergeThreshold) return false;
      const rel =
        params.relationshipByTargetId.get(c.upstashVectorId) ??
        heuristicMemoryRelationship(c.text, params.newText);
      return rel === 'contradiction';
    });
    return { type: 'supersede', targets: conflicting.length ? conflicting : [best] };
  }

  if (relationship === 'merge') return { type: 'merge', target: best };
  return { type: 'insert' };
}
