import { hasPlaceholderCorruption } from '../safety/memory-text-guard';
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
  options?: { maxInsights?: number; now?: Date }
): Promise<string> {
  const maxInsights = Math.min(MAX_INSIGHTS, Math.max(1, options?.maxInsights ?? MAX_INSIGHTS));

  const [insightsRes, probeRes, verifyRes, patternsRes] = await Promise.all([
    supabase
      .from('user_insights')
      .select(INSIGHT_COLUMNS)
      .eq('user_id', userId)
      .eq('status', INSIGHT_STATUS.ACTIVE)
      .neq('category', 'missing_info')
      .or('dedupe_key.is.null,dedupe_key.not.like.pattern:*')
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
    supabase
      .from('user_insights')
      .select('insight_text, metadata')
      .eq('user_id', userId)
      .eq('status', INSIGHT_STATUS.ACTIVE)
      .like('dedupe_key', 'pattern:%')
      .order('last_seen_at', { ascending: false })
      .limit(3)
      .returns<Array<{ insight_text: string; metadata: PatternMetaLite | null }>>(),
  ]);

  const insights = (insightsRes.error ? [] : insightsRes.data ?? []).filter(
    (r) => !hasPlaceholderCorruption(r.insight_text)
  );
  const patterns = patternsRes.error ? [] : patternsRes.data ?? [];
  const probeRow = probeRes.error ? null : probeRes.data?.[0] ?? null;
  const verifyRows = verifyRes.error ? [] : verifyRes.data ?? [];

  const probeText = probeRow
    ? (probeRow.metadata?.probe_question?.trim() || probeRow.insight_text.trim())
    : '';

  if (insights.length === 0 && !probeText && verifyRows.length === 0 && patterns.length === 0) return '';

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
      'עובדות לאימות — לא תסריט. אם זה יושב טבעי בקול הכותב, שאלה אחת לכל היותר. אסור לחקור. אסור לכפות שאלה בכל תור.'
    );
    for (const row of verifyRows) {
      const prompt =
        row.metadata?.verify_prompt?.trim() || `האם זה עדיין נכון: ${row.insight_text}`;
      lines.push(`- ${prompt}`);
    }
    lines.push('</InsightsNeedingVerification>');
  }

  if (patterns.length > 0) {
    lines.push('');
    lines.push(formatBehaviorPatterns(patterns, options?.now ?? new Date()));
  }

  lines.push('</UserContext>');
  return lines.join('\n');
}

type PatternMetaLite = {
  tip?: string;
  plan_title?: string;
  weekday?: number | null;
  daypart?: string | null;
  evidence_dates?: string[];
};

const WEEKDAYS_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

function israelWeekday(d: Date): number {
  const wd = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jerusalem', weekday: 'short' }).format(d);
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(wd);
}

/** Dated behaviour patterns from the nightly batch, with a "plan ahead" cue when the hard day is near. */
export function formatBehaviorPatterns(
  rows: Array<{ insight_text: string; metadata: PatternMetaLite | null }>,
  now: Date
): string {
  const today = israelWeekday(now);
  const out = [
    '<BehaviorPatterns>',
    'דפוסים חוזרים מהנתונים (עם תאריכים). השתמש בהם כדי לתכנן מראש — לא כדי לנזוף. לכל היותר פעם אחת בשיחה, ורק כשזה יושב טבעי. אל תצטט אותם כרשימה.',
  ];
  for (const r of rows) {
    const m = r.metadata ?? {};
    let cue = '';
    if (typeof m.weekday === 'number') {
      const until = (m.weekday - today + 7) % 7;
      if (until === 0) cue = ` ← היום ${WEEKDAYS_HE[m.weekday]}: בדוק בעדינות איך הולך ותן את הצעד הקטן.`;
      else if (until === 1) cue = ` ← מחר ${WEEKDAYS_HE[m.weekday]}: הצע תוכנית קטנה מראש${m.plan_title ? ` ("${m.plan_title}")` : ''}.`;
    }
    out.push(`- ${r.insight_text}${m.tip ? ` | צעד מוצע: ${m.tip}` : ''}${cue}`);
  }
  out.push('</BehaviorPatterns>');
  return out.join('\n');
}

function formatMentionSuffix(mentionCount: number): string {
  return mentionCount > 1 ? ` (Mentioned: ${mentionCount}x)` : '';
}
