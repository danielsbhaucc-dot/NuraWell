import { embedTextForRag } from './openrouter-embeddings';
import { normalizeFactTextForDedupe, stableMemoryVectorId } from './memory-fact-dedupe';
import {
  DEDUP_QUERY_TOP_K,
  SIMILARITY_MERGE_THRESHOLD,
  UPSTASH_NAMESPACE_USER_MEMORY,
} from './rag-config';
import { extractMemoryFactsFromUserMessage } from './extract-memory-facts';
import { mergeTwoUserMemoryLines } from './merge-memory-lines';
import { updateAiContext } from './memory';
import { createAdminClient } from '../supabase/admin';
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

function hitMemoryMeta(hit: { metadata?: unknown }): UserMemoryVectorMetadata | null {
  const m = hit.metadata;
  if (!m || typeof m !== 'object' || Array.isArray(m)) return null;
  const meta = m as UserMemoryVectorMetadata;
  return typeof meta.text === 'string' && typeof meta.userId === 'string' ? meta : null;
}

function hitMetaMemoryLevel(hit: { metadata?: unknown }): 2 | 3 | 4 {
  const m = hit.metadata;
  if (!m || typeof m !== 'object') return 2;
  const lv = (m as { memoryLevel?: unknown }).memoryLevel;
  if (lv === 2 || lv === 3 || lv === 4) return lv;
  return 2;
}

function nextSeenCount(meta: UserMemoryVectorMetadata | null): number {
  return typeof meta?.seenCount === 'number' && Number.isFinite(meta.seenCount)
    ? Math.max(1, Math.floor(meta.seenCount)) + 1
    : 2;
}

/**
 * רקע: חילוץ עובדות → embedding → שמירה ב-Upstash עם איחוד דומים.
 */
export async function ingestUserMessageIntoVectorMemory(params: {
  userId: string;
  userMessage: string;
  /**
   * עובדות מוכנות מראש — כשמסופקות, מדלגים על קריאת LLM נוספת (חיסכון טוקנים).
   * משמש את מנוע ה-dossier כדי לאחד את החילוץ לקריאה אחת בלבד.
   */
  preExtractedFacts?: ExtractedMemoryFact[];
}): Promise<IngestVectorMemoryResult> {
  if (!isUpstashVectorConfigured()) {
    return { facts_extracted: 0, upserts: [], skipped_reason: 'upstash_not_configured' };
  }

  const facts =
    params.preExtractedFacts ??
    (await extractMemoryFactsFromUserMessage(params.userMessage)).facts;
  if (!facts.length) {
    return { facts_extracted: 0, upserts: [] };
  }

  const upserts: IngestVectorMemoryResult['upserts'] = [];

  for (const fact of facts) {
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
      const prevMeta = hitMemoryMeta(exactHit);
      const meta: UserMemoryVectorMetadata = {
        userId: params.userId,
        text: fact.text.trim(),
        category: fact.category,
        updatedAt: now,
        firstSeenAt: prevMeta?.firstSeenAt ?? prevMeta?.updatedAt ?? now,
        lastSeenAt: now,
        seenCount: nextSeenCount(prevMeta),
        memoryLevel: fact.level,
        isInsight: fact.level >= 3,
      };
      await upsertUserMemoryVector({
        namespace: UPSTASH_NAMESPACE_USER_MEMORY,
        id: exactHit.id,
        vector: vec,
        metadata: meta,
      });
      if (fact.level === 4) {
        const admin = createAdminClient();
        await updateAiContext(admin, params.userId, {
          core_insight: fact.text.trim().slice(0, 500),
        });
      }

      upserts.push({ id: exactHit.id, action: 'exact_refresh', text: fact.text.trim() });
      continue;
    }

    const best = candidates.find((h) => h.score >= SIMILARITY_MERGE_THRESHOLD && hitMetaText(h));

    if (best && hitMetaText(best)) {
      const prevMeta = hitMemoryMeta(best);
      const prevText = hitMetaText(best)!;
      const mergedText = await mergeTwoUserMemoryLines(prevText, fact.text);
      const mergedVec = await embedTextForRag(mergedText);
      const mergedLevel = Math.max(hitMetaMemoryLevel(best), fact.level) as 2 | 3 | 4;

      const meta: UserMemoryVectorMetadata = {
        userId: params.userId,
        text: mergedText,
        category: fact.category,
        updatedAt: now,
        firstSeenAt: prevMeta?.firstSeenAt ?? prevMeta?.updatedAt ?? now,
        lastSeenAt: now,
        seenCount: nextSeenCount(prevMeta),
        supersedes: prevMeta?.supersedes?.slice(-10),
        memoryLevel: mergedLevel,
        isInsight: mergedLevel >= 3,
      };

      await upsertUserMemoryVector({
        namespace: UPSTASH_NAMESPACE_USER_MEMORY,
        id: best.id,
        vector: mergedVec,
        metadata: meta,
      });
      if (mergedLevel === 4) {
        const admin = createAdminClient();
        await updateAiContext(admin, params.userId, {
          core_insight: mergedText.trim().slice(0, 500),
        });
      }

      upserts.push({ id: best.id, action: 'merged', text: mergedText });
      continue;
    }

    const id = await stableMemoryVectorId(params.userId, normFact);
    const meta: UserMemoryVectorMetadata = {
      userId: params.userId,
      text: fact.text.trim(),
      category: fact.category,
      updatedAt: now,
      firstSeenAt: now,
      lastSeenAt: now,
      seenCount: 1,
      memoryLevel: fact.level,
      isInsight: fact.level >= 3,
    };

    await upsertUserMemoryVector({
      namespace: UPSTASH_NAMESPACE_USER_MEMORY,
      id,
      vector: vec,
      metadata: meta,
    });
    if (fact.level === 4) {
      const admin = createAdminClient();
      await updateAiContext(admin, params.userId, {
        core_insight: fact.text.trim().slice(0, 500),
      });
    }

    upserts.push({ id, action: 'inserted', text: fact.text.trim() });
  }

  return { facts_extracted: facts.length, upserts };
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
