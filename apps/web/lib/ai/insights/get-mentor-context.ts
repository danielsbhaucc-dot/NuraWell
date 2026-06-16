/**
 * הזרקת קונטקסט (Retrieval) — עם פילטור אגרסיבי למניעת ניפוח חלון-הקשר.
 *
 * משתמש עלול לצבור עשרות תובנות לאורך זמן. הזרקת כולן לפרומפט המנטור מנפחת
 * עלויות טוקנים *ומחלישה* את ציות-המודל ("lost in the middle"). לכן אנחנו
 * שולפים *רק* את הקצה העליון:
 *   • עד 5 תובנות מרכזיות, מדורגות לפי actionability → mention_count → טריות.
 *   • probe יחיד בלבד (לא חוקרים את המשתמש בכמה שאלות בו-זמנית).
 * הפלט הוא בלוק דחוס ביותר (חוסך טוקנים), עם תגיות מבנה שהמודל קל לפרסר.
 *
 * שתי שאילתות מקבילות (insights / probe) — מהיר, ממוקד, וטיפוסי במלואו.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

/** תקרה קשיחה של תובנות מרכזיות בפרומפט (anti-bloat). */
const MAX_INSIGHTS = 5;

/**
 * שורת תובנה שנשלפת (תת-קבוצה מטיפוסית של עמודות `user_insights`).
 * משותף לשתי השאילתות כדי לשמור על טיפוס יחיד ואמין.
 */
interface InsightRow {
  insight_text: string;
  mention_count: number;
  metadata: { probe_question?: string } | null;
}

const INSIGHT_COLUMNS = 'insight_text, mention_count, metadata' as const;

/**
 * מחזיר בלוק קונטקסט דחוס מוכן-להזרקה לפרומפט המנטור.
 * מחזיר מחרוזת ריקה ('') בחן כשאין למשתמש תובנות פעילות.
 *
 * @param supabase לקוח Supabase (admin בצד-שרת, או client מאומת — RLS ממילא
 *                 מגביל לשורות של המשתמש עצמו).
 */
export async function getMentorContext(
  supabase: SupabaseClient,
  userId: string,
  options?: { maxInsights?: number }
): Promise<string> {
  const maxInsights = Math.min(MAX_INSIGHTS, Math.max(1, options?.maxInsights ?? MAX_INSIGHTS));

  // שתי שאילתות מהירות במקביל: תובנות מרכזיות (ללא missing_info) + probe יחיד.
  const [insightsRes, probeRes] = await Promise.all([
    supabase
      .from('user_insights')
      .select(INSIGHT_COLUMNS)
      .eq('user_id', userId)
      .eq('is_active', true)
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
      .eq('is_active', true)
      .eq('category', 'missing_info')
      .order('actionability_score', { ascending: false })
      .order('mention_count', { ascending: false })
      .order('last_seen_at', { ascending: false })
      .limit(1)
      .returns<InsightRow[]>(),
  ]);

  const insights = insightsRes.error ? [] : insightsRes.data ?? [];
  const probeRow = probeRes.error ? null : probeRes.data?.[0] ?? null;
  const probeText = probeRow
    ? (probeRow.metadata?.probe_question?.trim() || probeRow.insight_text.trim())
    : '';

  // אין כלום להזריק — מחזירים מחרוזת ריקה (גרֵיספול, לא null).
  if (insights.length === 0 && !probeText) return '';

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

  lines.push('</UserContext>');
  return lines.join('\n');
}

/** מוסיף "(Mentioned: Nx)" רק כשהתובנה הוזכרה יותר מפעם אחת (אות חיזוק למודל). */
function formatMentionSuffix(mentionCount: number): string {
  return mentionCount > 1 ? ` (Mentioned: ${mentionCount}x)` : '';
}
