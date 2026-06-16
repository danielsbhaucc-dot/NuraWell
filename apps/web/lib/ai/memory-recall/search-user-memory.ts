/**
 * חיפוש זיכרון משתמש ב-user_insights — טקסטואלי, מהיר, מדויק בזמנים.
 */

import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { InsightCategory } from '../insights/schema';
import { INSIGHT_STATUS, type InsightStatus } from '../insights/status';
import {
  insightCategoriesForRecall,
  type MemoryRecallCategory,
} from './categories';
import { formatMemoryTimestamp } from './format-timestamp';

const MAX_RESULTS = 4;
const MIN_TOPIC_LEN = 2;

export type MemoryStatusLabel = 'Active' | 'Deprecated' | 'NeedsVerification';

export type UserMemoryHit = {
  id: string;
  fact: string;
  status: MemoryStatusLabel;
  category: string;
  created_at: string;
  updated_at: string;
  occurred_at_label: string;
};

export type SearchUserMemoryResult = {
  query: string;
  category_filter: MemoryRecallCategory | null;
  found_count: number;
  memories: UserMemoryHit[];
};

function statusToLabel(status: InsightStatus | string): MemoryStatusLabel {
  if (status === INSIGHT_STATUS.DEPRECATED) return 'Deprecated';
  if (status === INSIGHT_STATUS.NEEDS_VERIFICATION) return 'NeedsVerification';
  return 'Active';
}

/** מסנן תווים מיוחדים ל-PostgREST ilike. */
function escapeIlike(term: string): string {
  return term.replace(/[%_\\]/g, '\\$&');
}

function topicTokens(topic: string): string[] {
  return topic
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= MIN_TOPIC_LEN)
    .slice(0, 6);
}

type InsightRow = {
  id: string;
  insight_text: string;
  status: string;
  category: string;
  created_at: string;
  updated_at: string;
};

/**
 * מחפש תובנות עבר ב-user_insights לפי נושא (ולאופציונלי קטגוריה).
 * ממוין לפי created_at DESC — העדכני ביותר קודם.
 */
export async function searchUserMemory(
  supabase: SupabaseClient,
  userId: string,
  query: string,
  category?: MemoryRecallCategory
): Promise<SearchUserMemoryResult> {
  const topic = query.trim().slice(0, 120);
  const empty: SearchUserMemoryResult = {
    query: topic,
    category_filter: category ?? null,
    found_count: 0,
    memories: [],
  };

  if (topic.length < MIN_TOPIC_LEN) return empty;

  const dbCategories: InsightCategory[] | undefined = insightCategoriesForRecall(category);
  const pattern = `%${escapeIlike(topic)}%`;
  const tokens = topicTokens(topic);

  let q = supabase
    .from('user_insights')
    .select('id, insight_text, status, category, created_at, updated_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(MAX_RESULTS * 2);

  if (dbCategories?.length) {
    q = q.in('category', dbCategories);
  }

  const orParts = [`insight_text.ilike.${pattern}`];
  for (const token of tokens) {
    orParts.push(`insight_text.ilike.%${escapeIlike(token)}%`);
  }
  q = q.or(orParts.join(','));

  const { data, error } = await q;

  if (error) {
    console.warn('[memory-recall] search failed', { code: error.code, message: error.message });
    return empty;
  }

  const rows = (data ?? []) as InsightRow[];
  const ranked = rankMemoryHits(rows, topic, tokens).slice(0, MAX_RESULTS);

  return {
    query: topic,
    category_filter: category ?? null,
    found_count: ranked.length,
    memories: ranked.map((row) => ({
      id: row.id,
      fact: row.insight_text,
      status: statusToLabel(row.status),
      category: row.category,
      created_at: row.created_at,
      updated_at: row.updated_at,
      occurred_at_label: formatMemoryTimestamp(row.created_at),
    })),
  };
}

function rankMemoryHits(rows: InsightRow[], topic: string, tokens: string[]): InsightRow[] {
  const topicLower = topic.toLowerCase();

  return [...rows].sort((a, b) => {
    const scoreA = relevanceScore(a, topicLower, tokens);
    const scoreB = relevanceScore(b, topicLower, tokens);
    if (scoreB !== scoreA) return scoreB - scoreA;
    return Date.parse(b.created_at) - Date.parse(a.created_at);
  });
}

function relevanceScore(row: InsightRow, topicLower: string, tokens: string[]): number {
  const text = row.insight_text.toLowerCase();
  let score = 0;
  if (text.includes(topicLower)) score += 10;
  for (const t of tokens) {
    if (text.includes(t)) score += 3;
  }
  if (row.status === INSIGHT_STATUS.ACTIVE) score += 2;
  if (row.status === INSIGHT_STATUS.NEEDS_VERIFICATION) score += 1;
  return score;
}
