import type { ExtractedMemoryFact } from '../extract-memory-facts';
import { normalizeFactTextForDedupe, stableMemoryVectorId } from '../memory-fact-dedupe';
import { mergeTwoUserMemoryLines } from '../merge-memory-lines';
import { embedTextForRag } from '../openrouter-embeddings';
import { DEDUP_QUERY_TOP_K, SIMILARITY_MERGE_THRESHOLD, UPSTASH_NAMESPACE_USER_MEMORY } from '../rag-config';
import {
  isUpstashVectorConfigured,
  queryUserMemoryVectors,
  upsertUserMemoryVector,
  type QueryHit,
  type UserMemoryVectorMetadata,
} from '../upstash-vector-rest';
import { createAdminClient } from '../../supabase/admin';
import { deleteUserMemoryRecord } from './invalidate-memory';
import {
  decideMemoryReconcileAction,
  heuristicMemoryRelationship,
  type MemoryCandidate,
  type MemoryRelationship,
} from './memory-reconcile-decision';

export type ReconcileSessionMemoriesResult = {
  inserted: number;
  refreshed: number;
  merged: number;
  superseded: number;
  errors: number;
};

function hitText(hit: QueryHit): string | null {
  const m = hit.metadata;
  if (!m || typeof m !== 'object') return null;
  const t = (m as { text?: unknown }).text;
  return typeof t === 'string' && t.trim() ? t.trim() : null;
}

function hitCategory(hit: QueryHit): string {
  const m = hit.metadata;
  if (!m || typeof m !== 'object') return 'personal';
  const c = (m as { category?: unknown }).category;
  return typeof c === 'string' ? c : 'personal';
}

async function loadRowIdsByUpstashIds(
  userId: string,
  upstashIds: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!upstashIds.length) return map;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('user_memories')
    .select('id, upstash_vector_id')
    .eq('user_id', userId)
    .in('upstash_vector_id', upstashIds);

  if (error) throw error;
  for (const row of data ?? []) {
    map.set(row.upstash_vector_id as string, row.id as string);
  }
  return map;
}

function toCandidates(hits: QueryHit[], rowIds: Map<string, string>): MemoryCandidate[] {
  const out: MemoryCandidate[] = [];
  for (const h of hits) {
    const text = hitText(h);
    if (!text) continue;
    out.push({
      id: h.id,
      upstashVectorId: h.id,
      rowId: rowIds.get(h.id),
      text,
      score: h.score,
      category: hitCategory(h),
      normalizedText: normalizeFactTextForDedupe(text),
    });
  }
  return out;
}

async function upsertMemoryRow(params: {
  userId: string;
  memoryText: string;
  category: string;
  upstashVectorId: string;
  sourceSessionId?: string;
  memoryLevel: 2 | 3 | 4;
  vector: number[];
  prevMeta?: UserMemoryVectorMetadata | null;
}): Promise<void> {
  const now = new Date().toISOString();
  const text = params.memoryText.replace(/\s+/g, ' ').trim();

  if (isUpstashVectorConfigured()) {
    const meta: UserMemoryVectorMetadata = {
      userId: params.userId,
      text,
      category: params.category as UserMemoryVectorMetadata['category'],
      updatedAt: now,
      firstSeenAt: params.prevMeta?.firstSeenAt ?? params.prevMeta?.updatedAt ?? now,
      lastSeenAt: now,
      seenCount: (params.prevMeta?.seenCount ?? 0) + 1,
      memoryLevel: params.memoryLevel,
      isInsight: params.memoryLevel >= 3,
      schema: 'session-close-v1',
      supersedes: params.prevMeta?.supersedes,
    };
    await upsertUserMemoryVector({
      namespace: UPSTASH_NAMESPACE_USER_MEMORY,
      id: params.upstashVectorId,
      vector: params.vector,
      metadata: meta,
    });
  }

  const admin = createAdminClient();
  const row = {
    user_id: params.userId,
    memory_text: text,
    category: params.category,
    upstash_vector_id: params.upstashVectorId,
    source_session_id: params.sourceSessionId ?? null,
    updated_at: now,
  };

  const { data: existing } = await admin
    .from('user_memories')
    .select('id')
    .eq('upstash_vector_id', params.upstashVectorId)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await admin.from('user_memories').update(row).eq('id', existing.id);
    if (error) throw error;
  } else {
    const { error } = await admin.from('user_memories').insert(row);
    if (error) throw error;
  }
}

/**
 * מחלץ זיכרונות מסשן עם dedupe, מיזוג ו-b invalidation לסתירות.
 */
export async function reconcileSessionMemories(params: {
  userId: string;
  facts: ExtractedMemoryFact[];
  sourceSessionId?: string;
}): Promise<ReconcileSessionMemoriesResult> {
  const result: ReconcileSessionMemoriesResult = {
    inserted: 0,
    refreshed: 0,
    merged: 0,
    superseded: 0,
    errors: 0,
  };

  if (!params.facts.length) return result;

  for (const fact of params.facts) {
    try {
      const text = fact.text.replace(/\s+/g, ' ').trim();
      const vec = isUpstashVectorConfigured() ? await embedTextForRag(text) : [];

      const hits = isUpstashVectorConfigured()
        ? await queryUserMemoryVectors({
            userId: params.userId,
            vector: vec,
            topK: DEDUP_QUERY_TOP_K,
          })
        : [];

      const rowIds = await loadRowIdsByUpstashIds(
        params.userId,
        hits.map((h) => h.id)
      );
      const candidates = toCandidates(hits, rowIds);

      const relationshipByTargetId = new Map<string, MemoryRelationship>();
      for (const c of candidates) {
        relationshipByTargetId.set(
          c.upstashVectorId,
          heuristicMemoryRelationship(c.text, text)
        );
      }

      const action = decideMemoryReconcileAction({
        newText: text,
        candidates,
        relationshipByTargetId,
        mergeThreshold: SIMILARITY_MERGE_THRESHOLD,
      });

      if (action.type === 'exact_refresh') {
        const prevMeta = hits.find((h) => h.id === action.target.upstashVectorId)?.metadata as
          | UserMemoryVectorMetadata
          | undefined;
        await upsertMemoryRow({
          userId: params.userId,
          memoryText: text,
          category: fact.category,
          upstashVectorId: action.target.upstashVectorId,
          sourceSessionId: params.sourceSessionId,
          memoryLevel: fact.level,
          vector: vec,
          prevMeta: prevMeta ?? null,
        });
        result.refreshed += 1;
        continue;
      }

      if (action.type === 'merge') {
        const mergedText = await mergeTwoUserMemoryLines(action.target.text, text);
        const mergedVec = await embedTextForRag(mergedText);
        const prevMeta = hits.find((h) => h.id === action.target.upstashVectorId)?.metadata as
          | UserMemoryVectorMetadata
          | undefined;
        await upsertMemoryRow({
          userId: params.userId,
          memoryText: mergedText,
          category: fact.category,
          upstashVectorId: action.target.upstashVectorId,
          sourceSessionId: params.sourceSessionId,
          memoryLevel: Math.max(fact.level, prevMeta?.memoryLevel ?? 2) as 2 | 3 | 4,
          vector: mergedVec,
          prevMeta: prevMeta ?? null,
        });
        result.merged += 1;
        continue;
      }

      if (action.type === 'supersede') {
        for (const target of action.targets) {
          await deleteUserMemoryRecord({
            rowId: target.rowId,
            upstashVectorId: target.upstashVectorId,
          });
        }
        result.superseded += action.targets.length;

        const vectorId = await stableMemoryVectorId(
          params.userId,
          normalizeFactTextForDedupe(text)
        );
        await upsertMemoryRow({
          userId: params.userId,
          memoryText: text,
          category: fact.category,
          upstashVectorId: vectorId,
          sourceSessionId: params.sourceSessionId,
          memoryLevel: fact.level,
          vector: vec,
        });
        result.inserted += 1;
        continue;
      }

      const vectorId = await stableMemoryVectorId(
        params.userId,
        normalizeFactTextForDedupe(text)
      );
      await upsertMemoryRow({
        userId: params.userId,
        memoryText: text,
        category: fact.category,
        upstashVectorId: vectorId,
        sourceSessionId: params.sourceSessionId,
        memoryLevel: fact.level,
        vector: vec.length ? vec : await embedTextForRag(text),
      });
      result.inserted += 1;
    } catch (err) {
      result.errors += 1;
      console.warn('[reconcileSessionMemories] fact failed', {
        userId: params.userId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}
