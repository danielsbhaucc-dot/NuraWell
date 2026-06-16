/**
 * שמירת תובנות שחולצו לטבלת `user_insights` — עם לוגיקת מיזוג (anti-duplication).
 *
 * עקרון המיזוג (דרישת ה-edge case): אותה תובנה לא נשמרת פעמיים. לכל תובנה מחושב
 * `dedupe_key` יציב (category + ליבת הטקסט המנורמלת). אם כבר קיימת שורה עם אותו
 * מפתח למשתמש — *מעדכנים* אותה (מחדדים ניסוח, לוקחים את ה-actionability הגבוה,
 * מגדילים mention_count, מרעננים last_seen_at) במקום ליצור כפילות.
 *
 * כל הכתיבות עוברות דרך service-role (admin) — בצד שרת בלבד.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ExtractedInsight, InsightExtractionResult } from './schema';

export interface PersistInsightsResult {
  inserted: number;
  merged: number;
  skipped: number;
  errors: number;
}

/**
 * מפתח dedupe יציב לעברית/אנגלית: category + ליבת הטקסט (lowercase, בלי פיסוק,
 * רווחים מנורמלים). מנרמל כדי ש"מתקשה עם שגרת בוקר" ו"מתקשה עם שגרת הבוקר!"
 * ימוזגו. אורך מוגבל כדי לשמור על מפתח קומפקטי ויציב.
 */
export function insightDedupeKey(category: string, insightText: string): string {
  const core = insightText
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 90);
  return `${category}|${core}`;
}

type ExistingRow = {
  id: string;
  insight_text: string;
  actionability_score: number;
  mention_count: number;
};

export async function persistInsights(params: {
  admin: SupabaseClient;
  userId: string;
  extraction: InsightExtractionResult;
  sessionId?: string | null;
  now?: Date;
}): Promise<PersistInsightsResult> {
  const { admin, userId, extraction } = params;
  const now = params.now ?? new Date();
  const nowIso = now.toISOString();
  const result: PersistInsightsResult = { inserted: 0, merged: 0, skipped: 0, errors: 0 };

  for (const insight of extraction.insights) {
    const key = insightDedupeKey(insight.category, insight.insight_text);
    if (!key || key.endsWith('|')) {
      result.skipped += 1;
      continue;
    }

    // select-first ואז insert/update — דפוס בטוח (כמו ב-almog-commitments/persist).
    const { data: existing, error: selectErr } = await admin
      .from('user_insights')
      .select('id, insight_text, actionability_score, mention_count')
      .eq('user_id', userId)
      .eq('dedupe_key', key)
      .maybeSingle();

    if (selectErr) {
      console.warn('[insights] select failed', { code: selectErr.code, error: selectErr.message });
      result.errors += 1;
      continue;
    }

    if (existing) {
      const row = existing as ExistingRow;
      const { error: updateErr } = await admin
        .from('user_insights')
        .update({
          // מחדדים לניסוח החדש (המודל הונחה להחזיר את המעודכן ביותר).
          insight_text: insight.insight_text,
          // לא מורידים actionability שכבר נצבר — לוקחים את הגבוה.
          actionability_score: Math.max(row.actionability_score, insight.actionability_score),
          confidence: insight.confidence,
          is_active: true,
          mention_count: row.mention_count + 1,
          last_seen_at: nowIso,
          metadata: buildMetadata(insight),
        })
        .eq('id', row.id);
      if (updateErr) {
        console.warn('[insights] update failed', { code: updateErr.code, error: updateErr.message });
        result.errors += 1;
      } else {
        result.merged += 1;
      }
      continue;
    }

    const { error: insertErr } = await admin.from('user_insights').insert({
      user_id: userId,
      category: insight.category,
      insight_text: insight.insight_text,
      actionability_score: insight.actionability_score,
      confidence: insight.confidence,
      is_active: true,
      dedupe_key: key,
      mention_count: 1,
      last_seen_at: nowIso,
      source_session_id: params.sessionId ?? null,
      metadata: buildMetadata(insight),
    });
    if (insertErr) {
      console.warn('[insights] insert failed', { code: insertErr.code, error: insertErr.message });
      result.errors += 1;
    } else {
      result.inserted += 1;
    }
  }

  return result;
}

/** שומר את ה-probe_question וה-evidence ב-metadata (לא עמודות מן המניין). */
function buildMetadata(insight: ExtractedInsight): Record<string, unknown> {
  const meta: Record<string, unknown> = {};
  if (insight.probe_question) meta.probe_question = insight.probe_question;
  if (insight.evidence) meta.evidence = insight.evidence;
  return meta;
}
