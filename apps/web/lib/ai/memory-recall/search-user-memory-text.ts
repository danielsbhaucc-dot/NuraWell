/**
 * חיפוש טקסטואלי (ilike) — fallback כש-embedding או RPC נכשלים.
 */

import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { InsightCategory } from '../insights/schema';
import { INSIGHT_STATUS } from '../insights/status';
import { formatMemoryTimestamp } from './format-timestamp';
import type { UserMemoryHit } from './search-user-memory-types';

const MAX_RESULTS = 4;
const MIN_TOPIC_LEN = 2;

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

function statusToLabel(status: string): UserMemoryHit['status'] {
  if (status === INSIGHT_STATUS.DEPRECATED) return 'Deprecated';
  if (status === INSIGHT_STATUS.NEEDS_VERIFICATION) return 'NeedsVerification';
  return 'Active';
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
  return score;
}

export async function searchUserMemoryTextFallback(
  supabase: SupabaseClient,
  userId: string,
  topic: string,
  dbCategories?: InsightCategory[]
): Promise<UserMemoryHit[]> {
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
    console.warn('[memory-recall] text fallback failed', { code: error.code, message: error.message });
    return [];
  }

  const rows = (data ?? []) as InsightRow[];
  return rankMemoryHits(rows, topic, tokens).slice(0, MAX_RESULTS).map((row) => ({
    id: row.id,
    fact: row.insight_text,
    status: statusToLabel(row.status),
    category: row.category,
    created_at: row.created_at,
    updated_at: row.updated_at,
    occurred_at_label: formatMemoryTimestamp(row.created_at),
  }));
}
