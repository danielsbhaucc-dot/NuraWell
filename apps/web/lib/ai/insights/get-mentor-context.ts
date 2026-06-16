/**
 * הזרקת קונטקסט (Retrieval) — עם פילטור אגרסיבי למניעת ניפוח חלון-הקשר.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { INSIGHT_STATUS, MENTOR_VISIBLE_STATUSES } from './status';

const MAX_INSIGHTS = 5;

interface InsightRow {
  insight_text: string;
  mention_count: number;
  status: string;
  metadata: { probe_question?: string; verify_prompt?: string } | null;
}

const INSIGHT_COLUMNS = 'insight_text, mention_count, status, metadata' as const;

export async function getMentorContext(
  supabase: SupabaseClient,
  userId: string,
  options?: { maxInsights?: number }
): Promise<string> {
  const maxInsights = Math.min(MAX_INSIGHTS, Math.max(1, options?.maxInsights ?? MAX_INSIGHTS));

  const [insightsRes, probeRes, verifyRes] = await Promise.all([
    supabase
      .from('user_insights')
      .select(INSIGHT_COLUMNS)
      .eq('user_id', userId)
      .eq('status', INSIGHT_STATUS.ACTIVE)
      .neq('category', 'missing_info')
      .order('actionability_score', { ascending: false })
      .order('mention_count', { ascending: false })
      .order('last_seen_at', { ascending: false })
      .limit(maxInsights)
      .returns<InsightRow[]>(),
    supabase
      .from('user_insights')
      .select(INSIGHT_COLUMNS)
      .eq('user_id', userId)
      .in('status', [...MENTOR_VISIBLE_STATUSES])
      .eq('category', 'missing_info')
      .order('actionability_score', { ascending: false })
      .order('mention_count', { ascending: false })
      .order('last_seen_at', { ascending: false })
      .limit(1)
      .returns<InsightRow[]>(),
    supabase
      .from('user_insights')
      .select(INSIGHT_COLUMNS)
      .eq('user_id', userId)
      .eq('status', INSIGHT_STATUS.NEEDS_VERIFICATION)
      .order('updated_at', { ascending: false })
      .limit(3)
      .returns<InsightRow[]>(),
  ]);

  const insights = insightsRes.error ? [] : insightsRes.data ?? [];
  const probeRow = probeRes.error ? null : probeRes.data?.[0] ?? null;
  const verifyRows = verifyRes.error ? [] : verifyRes.data ?? [];

  const probeText = probeRow
    ? (probeRow.metadata?.probe_question?.trim() || probeRow.insight_text.trim())
    : '';

  if (insights.length === 0 && !probeText && verifyRows.length === 0) return '';

  const lines: string[] = ['<UserContext>'];
  for (const row of insights) {
    lines.push(`- ${row.insight_text}${formatMentionSuffix(row.mention_count)}`);
  }

  if (probeText) {
    lines.push('');
    lines.push('<MissingInfoToProbe>');
    lines.push(`- ${probeText}`);
    lines.push('</MissingInfoToProbe>');
  }

  if (verifyRows.length > 0) {
    lines.push('');
    lines.push('<InsightsNeedingVerification>');
    lines.push(
      'שאל בעדינות לאמת את הנקודות הבאות — אל תניח שהמידע הישן עדיין נכון:'
    );
    for (const row of verifyRows) {
      const prompt =
        row.metadata?.verify_prompt?.trim() || `האם זה עדיין נכון: ${row.insight_text}`;
      lines.push(`- ${prompt}`);
    }
    lines.push('</InsightsNeedingVerification>');
  }

  lines.push('</UserContext>');
  return lines.join('\n');
}

function formatMentionSuffix(mentionCount: number): string {
  return mentionCount > 1 ? ` (Mentioned: ${mentionCount}x)` : '';
}
