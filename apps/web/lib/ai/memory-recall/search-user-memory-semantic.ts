/**
 * חיפוש סמנטי דרך Upstash Vector (namespace user-memory, isInsight = true).
 */

import 'server-only';

import { embedInsightText, isInsightEmbeddingEnabled } from '../insights/embed-insight';
import type { InsightCategory } from '../insights/schema';
import { INSIGHT_STATUS } from '../insights/status';
import {
  buildInsightRecallFilter,
  insightIdFromVectorId,
} from '../insights/sync-insight-vector';
import {
  isUpstashVectorConfigured,
  queryUserMemoryVectors,
  type UserMemoryVectorMetadata,
} from '../upstash-vector-rest';
import { formatMemoryTimestamp } from './format-timestamp';
import type { UserMemoryHit } from './search-user-memory-types';

const MAX_RESULTS = 4;

const DEFAULT_MATCH_THRESHOLD = (() => {
  const raw = process.env.MEMORY_RECALL_MATCH_THRESHOLD?.trim();
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 && n < 1 ? n : 0.72;
})();

function statusToLabel(status: string | undefined): UserMemoryHit['status'] {
  if (status === INSIGHT_STATUS.DEPRECATED) return 'Deprecated';
  if (status === INSIGHT_STATUS.NEEDS_VERIFICATION) return 'NeedsVerification';
  return 'Active';
}

function hitToMemory(row: UserMemoryVectorMetadata, vectorId: string, score: number): UserMemoryHit | null {
  const text = row.text?.trim();
  if (!text || row.insightStatus === INSIGHT_STATUS.DEPRECATED) return null;
  if (score < DEFAULT_MATCH_THRESHOLD) return null;

  const createdAt = row.firstSeenAt ?? row.updatedAt ?? new Date().toISOString();
  const updatedAt = row.updatedAt ?? createdAt;

  return {
    id: insightIdFromVectorId(vectorId),
    fact: text,
    status: statusToLabel(row.insightStatus),
    category: row.insightCategory ?? row.category,
    created_at: createdAt,
    updated_at: updatedAt,
    occurred_at_label: formatMemoryTimestamp(createdAt),
  };
}

export async function searchUserMemorySemantic(
  userId: string,
  topic: string,
  dbCategories?: InsightCategory[]
): Promise<UserMemoryHit[] | null> {
  if (!isInsightEmbeddingEnabled() || !isUpstashVectorConfigured()) return null;

  const embedding = await embedInsightText(topic);
  if (!embedding) return null;

  try {
    const hits = await queryUserMemoryVectors({
      userId,
      vector: embedding,
      topK: MAX_RESULTS * 2,
      filter: buildInsightRecallFilter(userId, dbCategories),
    });

    const memories: UserMemoryHit[] = [];
    for (const hit of hits) {
      const meta = hit.metadata as UserMemoryVectorMetadata | undefined;
      if (!meta?.isInsight) continue;
      const mapped = hitToMemory(meta, hit.id, hit.score);
      if (mapped) memories.push(mapped);
    }

    return memories.slice(0, MAX_RESULTS);
  } catch (err) {
    console.warn('[memory-recall] upstash semantic failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
