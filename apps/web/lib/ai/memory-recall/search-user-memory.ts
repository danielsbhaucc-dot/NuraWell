/**
 * חיפוש זיכרון משתמש — סמנטי (Upstash) עם fallback ל-ilike ב-Supabase.
 */

import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  insightCategoriesForRecall,
  type MemoryRecallCategory,
} from './categories';
import { searchUserMemorySemantic } from './search-user-memory-semantic';
import { searchUserMemoryTextFallback } from './search-user-memory-text';
import type { SearchUserMemoryResult } from './search-user-memory-types';

export type {
  MemoryStatusLabel,
  SearchUserMemoryResult,
  UserMemoryHit,
} from './search-user-memory-types';

const MIN_TOPIC_LEN = 2;

/**
 * מחפש תובנות עבר ב-user_insights לפי נושא (ולאופציונלי קטגוריה).
 * 1) embed + Upstash query (insight vectors)
 * 2) fallback ilike ב-user_insights אם Upstash/embedding נכשלו
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
    search_mode: 'text_fallback',
    memories: [],
  };

  if (topic.length < MIN_TOPIC_LEN) return empty;

  const dbCategories = insightCategoriesForRecall(category);

  const semanticHits = await searchUserMemorySemantic(userId, topic, dbCategories);
  if (semanticHits !== null) {
    return {
      query: topic,
      category_filter: category ?? null,
      found_count: semanticHits.length,
      search_mode: 'semantic',
      memories: semanticHits,
    };
  }

  const textHits = await searchUserMemoryTextFallback(supabase, userId, topic, dbCategories);
  return {
    query: topic,
    category_filter: category ?? null,
    found_count: textHits.length,
    search_mode: 'text_fallback',
    memories: textHits,
  };
}
