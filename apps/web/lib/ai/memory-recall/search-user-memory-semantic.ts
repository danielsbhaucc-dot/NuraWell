/**
 * חיפוש סמנטי דרך match_user_insights (pgvector).
 */

import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

import { embedInsightText, isInsightEmbeddingEnabled } from '../insights/embed-insight';
import type { InsightCategory } from '../insights/schema';
import { INSIGHT_STATUS } from '../insights/status';
import { formatMemoryTimestamp } from './format-timestamp';
import type { UserMemoryHit } from './search-user-memory-types';

const MAX_RESULTS = 4;

const DEFAULT_MATCH_THRESHOLD = (() => {
  const raw = process.env.MEMORY_RECALL_MATCH_THRESHOLD?.trim();
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 && n < 1 ? n : 0.72;
})();

type RpcRow = {
  id: string;
  insight_text: string;
  status: string;
  category: string;
  created_at: string;
  updated_at: string;
  similarity: number;
};

function statusToLabel(status: string): UserMemoryHit['status'] {
  if (status === INSIGHT_STATUS.DEPRECATED) return 'Deprecated';
  if (status === INSIGHT_STATUS.NEEDS_VERIFICATION) return 'NeedsVerification';
  return 'Active';
}

export async function searchUserMemorySemantic(
  supabase: SupabaseClient,
  userId: string,
  topic: string,
  dbCategories?: InsightCategory[]
): Promise<UserMemoryHit[] | null> {
  if (!isInsightEmbeddingEnabled()) return null;

  const embedding = await embedInsightText(topic);
  if (!embedding) return null;

  const { data, error } = await supabase.rpc('match_user_insights', {
    query_embedding: embedding,
    match_threshold: DEFAULT_MATCH_THRESHOLD,
    match_count: MAX_RESULTS,
    p_user_id: userId,
    p_categories: dbCategories?.length ? dbCategories : null,
  });

  if (error) {
    console.warn('[memory-recall] semantic rpc failed', { code: error.code, message: error.message });
    return null;
  }

  const rows = (data ?? []) as RpcRow[];
  if (!rows.length) return [];

  return rows.map((row) => ({
    id: row.id,
    fact: row.insight_text,
    status: statusToLabel(row.status),
    category: row.category,
    created_at: row.created_at,
    updated_at: row.updated_at,
    occurred_at_label: formatMemoryTimestamp(row.created_at),
  }));
}
