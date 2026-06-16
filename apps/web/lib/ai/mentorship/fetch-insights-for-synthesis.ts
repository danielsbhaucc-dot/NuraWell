/**
 * שליפה ממוקדת של תובנות גולמיות לסינתזה — לא שולפים 1,000 שורות.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { InsightCategory } from '../insights/schema';

/** תקרה קשיחה — מספיק לסינתזה בלי לנפח טוקנים ל-LLM. */
export const SYNTHESIS_INSIGHT_LIMIT = 20;

/** תובנות ישנות מדי לא נכנסות לסינתזה (ימים). */
export const SYNTHESIS_LOOKBACK_DAYS = 90;

/** סף ביטחון מינימלי — מסנן רעש לפני שליחה למודל. */
export const SYNTHESIS_MIN_CONFIDENCE = 0.5;

export type InsightForSynthesis = {
  category: InsightCategory;
  insight_text: string;
  actionability_score: number;
  confidence: number;
  mention_count: number;
  last_seen_at: string;
};

const INSIGHT_SELECT =
  'category, insight_text, actionability_score, confidence, mention_count, last_seen_at' as const;

/**
 * שולף את התובנות הפעילות הרלוונטיות ביותר למשתמש, מדורגות לפי בנות-פעולה וטריות.
 */
export async function fetchInsightsForSynthesis(
  admin: SupabaseClient,
  userId: string,
  options?: { limit?: number; lookbackDays?: number }
): Promise<InsightForSynthesis[]> {
  const limit = Math.min(
    SYNTHESIS_INSIGHT_LIMIT,
    Math.max(5, options?.limit ?? SYNTHESIS_INSIGHT_LIMIT)
  );
  const lookbackDays = options?.lookbackDays ?? SYNTHESIS_LOOKBACK_DAYS;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - lookbackDays);

  const { data, error } = await admin
    .from('user_insights')
    .select(INSIGHT_SELECT)
    .eq('user_id', userId)
    .eq('is_active', true)
    .gte('confidence', SYNTHESIS_MIN_CONFIDENCE)
    .gte('last_seen_at', cutoff.toISOString())
    .order('actionability_score', { ascending: false })
    .order('mention_count', { ascending: false })
    .order('last_seen_at', { ascending: false })
    .limit(limit)
    .returns<InsightForSynthesis[]>();

  if (error) {
    console.warn('[mentorship] fetch insights failed', { code: error.code, error: error.message });
    return [];
  }

  return data ?? [];
}

/** מקבץ תובנות לפי קטגוריה לפורמט קומפקטי לפרומפט הסינתזה. */
export function groupInsightsForPrompt(insights: InsightForSynthesis[]): string {
  if (!insights.length) return 'אין תובנות פעילות.';

  const byCategory = new Map<string, InsightForSynthesis[]>();
  for (const row of insights) {
    const bucket = byCategory.get(row.category) ?? [];
    bucket.push(row);
    byCategory.set(row.category, bucket);
  }

  const categoryOrder: InsightCategory[] = [
    'mental',
    'blocker',
    'preference',
    'goal',
    'fitness',
    'nutrition',
    'missing_info',
  ];

  const lines: string[] = [];
  for (const cat of categoryOrder) {
    const rows = byCategory.get(cat);
    if (!rows?.length) continue;
    lines.push(`[${cat}]`);
    for (const row of rows) {
      lines.push(`- ${row.insight_text}`);
    }
    lines.push('');
  }

  return lines.join('\n').trim();
}
