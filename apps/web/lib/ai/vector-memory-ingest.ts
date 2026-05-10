import { embedTextForRag } from './openrouter-embeddings';
import { normalizeFactTextForDedupe, stableMemoryVectorId } from './memory-fact-dedupe';
import {
  DEDUP_QUERY_TOP_K,
  SIMILARITY_MERGE_THRESHOLD,
  UPSTASH_NAMESPACE_USER_MEMORY,
} from './rag-config';
import { extractMemoryFactsFromUserMessage } from './extract-memory-facts';
import { mergeTwoUserMemoryLines } from './merge-memory-lines';
import {
  isUpstashVectorConfigured,
  queryUserMemoryVectors,
  upsertUserMemoryVector,
  type UserMemoryVectorMetadata,
} from './upstash-vector-rest';
import type { ExtractedMemoryFact, MemoryExtractionResult } from './extract-memory-facts';

export type IngestVectorMemoryResult = {
  facts_extracted: number;
  upserts: Array<{ id: string; action: 'inserted' | 'merged' | 'exact_refresh'; text: string }>;
  skipped_reason?: string;
};

function hitMetaText(hit: { metadata?: unknown }): string | null {
  const m = hit.metadata;
  if (!m || typeof m !== 'object') return null;
  const t = (m as { text?: unknown }).text;
  return typeof t === 'string' && t.trim() ? t.trim() : null;
}

/**
 * רקע: חילוץ עובדות → embedding → שמירה ב-Upstash עם איחוד דומים.
 */
export async function ingestUserMessageIntoVectorMemory(params: {
  userId: string;
  userMessage: string;
}): Promise<IngestVectorMemoryResult> {
  if (!isUpstashVectorConfigured()) {
    return { facts_extracted: 0, upserts: [], skipped_reason: 'upstash_not_configured' };
  }

  const extraction = await extractMemoryFactsFromUserMessage(params.userMessage);
  if (!extraction.facts.length) {
    return { facts_extracted: 0, upserts: [] };
  }

  const upserts: IngestVectorMemoryResult['upserts'] = [];

  for (const fact of extraction.facts) {
    const vec = await embedTextForRag(fact.text);
    const normFact = normalizeFactTextForDedupe(fact.text);

    const candidates = await queryUserMemoryVectors({
      userId: params.userId,
      vector: vec,
      topK: DEDUP_QUERY_TOP_K,
    });

    const now = new Date().toISOString();

    /** כפילות מילולית (אותו ניסוח נורמלי) — רענון וקטור קיים, בלי שורה חדשה */
    const exactHit = candidates.find((h) => {
      const t = hitMetaText(h);
      return t != null && normalizeFactTextForDedupe(t) === normFact;
    });
    if (exactHit) {
      const meta: UserMemoryVectorMetadata = {
        userId: params.userId,
        text: fact.text.trim(),
        category: fact.category,
        updatedAt: now,
      };
      await upsertUserMemoryVector({
        namespace: UPSTASH_NAMESPACE_USER_MEMORY,
        id: exactHit.id,
        vector: vec,
        metadata: meta,
      });
      upserts.push({ id: exactHit.id, action: 'exact_refresh', text: fact.text.trim() });
      continue;
    }

    const best = candidates.find((h) => h.score >= SIMILARITY_MERGE_THRESHOLD && hitMetaText(h));

    if (best && hitMetaText(best)) {
      const prevText = hitMetaText(best)!;
      const mergedText = await mergeTwoUserMemoryLines(prevText, fact.text);
      const mergedVec = await embedTextForRag(mergedText);

      const meta: UserMemoryVectorMetadata = {
        userId: params.userId,
        text: mergedText,
        category: fact.category,
        updatedAt: now,
      };

      await upsertUserMemoryVector({
        namespace: UPSTASH_NAMESPACE_USER_MEMORY,
        id: best.id,
        vector: mergedVec,
        metadata: meta,
      });

      upserts.push({ id: best.id, action: 'merged', text: mergedText });
      continue;
    }

    const id = await stableMemoryVectorId(params.userId, normFact);
    const meta: UserMemoryVectorMetadata = {
      userId: params.userId,
      text: fact.text.trim(),
      category: fact.category,
      updatedAt: now,
    };

    await upsertUserMemoryVector({
      namespace: UPSTASH_NAMESPACE_USER_MEMORY,
      id,
      vector: vec,
      metadata: meta,
    });

    upserts.push({ id, action: 'inserted', text: fact.text.trim() });
  }

  return { facts_extracted: extraction.facts.length, upserts };
}

export type VectorMemoryPreviewResult = {
  extraction: MemoryExtractionResult;
  per_fact: Array<{
    fact: ExtractedMemoryFact;
    top_similar: Array<{ id: string; score: number; text: string | null; would_merge: boolean }>;
  }>;
  query_probe: { embedded: boolean; top_hits: Array<{ id: string; score: number; text: string | null }> };
};

/**
 * בדיקה: חילוץ, מועמדים ל-dedup, ושליפת RAG לפי הטקסט (בלי כתיבה ל-Upstash).
 */
export async function previewVectorMemoryIngest(params: {
  userId: string;
  userMessage: string;
}): Promise<VectorMemoryPreviewResult> {
  if (!isUpstashVectorConfigured()) {
    const extraction = await extractMemoryFactsFromUserMessage(params.userMessage);
    return {
      extraction,
      per_fact: [],
      query_probe: { embedded: false, top_hits: [] },
    };
  }

  const extraction = await extractMemoryFactsFromUserMessage(params.userMessage);
  const per_fact: Array<{
    fact: import('./extract-memory-facts').ExtractedMemoryFact;
    top_similar: Array<{ id: string; score: number; text: string | null; would_merge: boolean }>;
  }> = [];

  for (const fact of extraction.facts) {
    const vec = await embedTextForRag(fact.text);
    const candidates = await queryUserMemoryVectors({
      userId: params.userId,
      vector: vec,
      topK: DEDUP_QUERY_TOP_K,
    });
    per_fact.push({
      fact,
      top_similar: candidates.map((c) => ({
        id: c.id,
        score: c.score,
        text: hitMetaText(c),
        would_merge: c.score >= SIMILARITY_MERGE_THRESHOLD && Boolean(hitMetaText(c)),
      })),
    });
  }

  let query_probe: { embedded: boolean; top_hits: Array<{ id: string; score: number; text: string | null }> } = {
    embedded: false,
    top_hits: [],
  };

  try {
    const qv = await embedTextForRag(params.userMessage);
    const hits = await queryUserMemoryVectors({
      userId: params.userId,
      vector: qv,
      topK: 3,
    });
    query_probe = {
      embedded: true,
      top_hits: hits.map((h) => ({ id: h.id, score: h.score, text: hitMetaText(h) })),
    };
  } catch {
    query_probe = { embedded: false, top_hits: [] };
  }

  return { extraction, per_fact, query_probe };
}
