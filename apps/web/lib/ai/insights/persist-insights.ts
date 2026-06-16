/**
 * שמירת תובנות שחולצו לטבלת `user_insights` — עם לוגיקת מיזוג (anti-duplication).
 *
 * עקרון המיזוג (דרישת ה-edge case): אותה תובנה לא נשמרת פעמיים. לכל תובנה מחושב
 * `dedupe_key` יציב (category + ליבת הטקסט המנורמלת). אם כבר קיימת שורה עם אותו
 * מפתח למשתמש — *מעדכנים* אותה (מחדדים ניסוח, לוקחים את ה-actionability הגבוה,
 * מגדילים mention_count, מרעננים last_seen_at) במקום ליצור כפילות.
 *
 * וקטורי recall סמנטי נשמרים ב-Upstash (לא ב-Supabase). כל הכתיבות ל-DB עוברות
 * דרך service-role (admin) — בצד שרת בלבד.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ExtractedInsight, InsightExtractionResult } from './schema';
import { syncInsightVectorToUpstash } from './sync-insight-vector';
import { INSIGHT_STATUS } from './status';

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
  category: string;
  actionability_score: number;
  mention_count: number;
  created_at: string;
  updated_at: string;
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

    const { data: existing, error: selectErr } = await admin
      .from('user_insights')
      .select('id, insight_text, category, actionability_score, mention_count, created_at, updated_at')
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
      const textChanged = insight.insight_text.trim() !== row.insight_text.trim();
      const { error: updateErr } = await admin
        .from('user_insights')
        .update({
          insight_text: insight.insight_text,
          actionability_score: Math.max(row.actionability_score, insight.actionability_score),
          confidence: insight.confidence,
          status: INSIGHT_STATUS.ACTIVE,
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
        if (textChanged) {
          void syncInsightVectorToUpstash({
            userId,
            insightId: row.id,
            insightText: insight.insight_text,
            insightCategory: insight.category,
            status: INSIGHT_STATUS.ACTIVE,
            createdAt: row.created_at,
            updatedAt: nowIso,
          });
        }
      }
      continue;
    }

    const { data: inserted, error: insertErr } = await admin
      .from('user_insights')
      .insert({
        user_id: userId,
        category: insight.category,
        insight_text: insight.insight_text,
        actionability_score: insight.actionability_score,
        confidence: insight.confidence,
        status: INSIGHT_STATUS.ACTIVE,
        is_active: true,
        dedupe_key: key,
        mention_count: 1,
        last_seen_at: nowIso,
        source_session_id: params.sessionId ?? null,
        metadata: buildMetadata(insight),
      })
      .select('id, created_at, updated_at')
      .single();

    if (insertErr) {
      console.warn('[insights] insert failed', { code: insertErr.code, error: insertErr.message });
      result.errors += 1;
    } else if (inserted) {
      result.inserted += 1;
      void syncInsightVectorToUpstash({
        userId,
        insightId: inserted.id,
        insightText: insight.insight_text,
        insightCategory: insight.category,
        status: INSIGHT_STATUS.ACTIVE,
        createdAt: inserted.created_at,
        updatedAt: inserted.updated_at ?? nowIso,
      });
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
