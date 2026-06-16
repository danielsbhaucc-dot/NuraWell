/**
 * סנכרון תובנות מ-user_insights ל-Upstash Vector (namespace user-memory).
 * מזהה וקטור: insight:{uuid} — מופרד מעובדות זיכרון רגילות מהצ'אט.
 */

import 'server-only';

import type { InsightCategory } from './schema';
import { embedInsightText, isInsightEmbeddingEnabled } from './embed-insight';
import { INSIGHT_STATUS } from './status';
import {
  deleteUserMemoryVectorById,
  isUpstashVectorConfigured,
  upsertUserMemoryVector,
} from '../upstash-vector-rest';

export const INSIGHT_VECTOR_ID_PREFIX = 'insight:';

export function insightVectorId(insightId: string): string {
  return `${INSIGHT_VECTOR_ID_PREFIX}${insightId}`;
}

export function insightIdFromVectorId(vectorId: string): string {
  return vectorId.startsWith(INSIGHT_VECTOR_ID_PREFIX)
    ? vectorId.slice(INSIGHT_VECTOR_ID_PREFIX.length)
    : vectorId;
}

function escapeFilterString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/** מסנן Upstash ל-recall_past_memory — רק וקטורי תובנות של המשתמש. */
export function buildInsightRecallFilter(userId: string, dbCategories?: InsightCategory[]): string {
  const parts = [`userId = ${escapeFilterString(userId)}`, 'isInsight = true'];
  if (dbCategories?.length) {
    const cats = dbCategories.map((c) => `insightCategory = ${escapeFilterString(c)}`).join(' OR ');
    parts.push(`(${cats})`);
  }
  return parts.join(' AND ');
}

export type SyncInsightVectorParams = {
  userId: string;
  insightId: string;
  insightText: string;
  insightCategory: InsightCategory | string;
  status: string;
  createdAt: string;
  updatedAt: string;
  /** דלג על embedding מחדש כשהטקסט לא השתנה (חוסך עלות). */
  skipEmbed?: boolean;
};

export async function syncInsightVectorToUpstash(params: SyncInsightVectorParams): Promise<void> {
  if (!isInsightEmbeddingEnabled() || !isUpstashVectorConfigured()) return;

  if (params.status === INSIGHT_STATUS.DEPRECATED) {
    await removeInsightVectorFromUpstash(params.insightId);
    return;
  }

  const text = params.insightText.replace(/\s+/g, ' ').trim();
  if (!text) return;

  const vector = params.skipEmbed ? null : await embedInsightText(text);
  if (!vector) return;

  try {
    await upsertUserMemoryVector({
      id: insightVectorId(params.insightId),
      vector,
      metadata: {
        userId: params.userId,
        text,
        category: 'insight',
        isInsight: true,
        insightCategory: params.insightCategory,
        insightStatus: params.status,
        updatedAt: params.updatedAt,
        firstSeenAt: params.createdAt,
        lastSeenAt: params.updatedAt,
        memoryLevel: 3,
      },
    });
  } catch (err) {
    console.warn('[insights] upstash sync failed', {
      insightId: params.insightId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function removeInsightVectorFromUpstash(insightId: string): Promise<void> {
  if (!isUpstashVectorConfigured()) return;
  try {
    await deleteUserMemoryVectorById(insightVectorId(insightId));
  } catch (err) {
    console.warn('[insights] upstash delete failed', {
      insightId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
