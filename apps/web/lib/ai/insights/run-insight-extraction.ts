/**
 * אורקסטרטור מנוע התובנות: מושך את ההודעות האחרונות מ-session צ'אט, מריץ את
 * החילוץ (LLM) ושומר עם מיזוג. זו נקודת-הכניסה היחידה שתהליכי-רקע/CRON/route
 * צריכים לקרוא לה.
 *
 * server-only — כל החילוץ קורה בשרת דרך service-role (פרטיות המשתמש).
 */

import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

import { INSIGHT_STATUS } from './status';

import { extractInsights } from './extract-insights';
import { persistInsights, type PersistInsightsResult } from './persist-insights';

/** ברירת מחדל לכמות ההודעות שמנתחים מתור-השיחה. */
const DEFAULT_MESSAGE_LIMIT = 20;

type ChatRow = { role: string; content: string };

export interface RunInsightExtractionResult extends PersistInsightsResult {
  messages_analyzed: number;
  insights_extracted: number;
}

const EMPTY_RESULT: RunInsightExtractionResult = {
  messages_analyzed: 0,
  insights_extracted: 0,
  inserted: 0,
  merged: 0,
  skipped: 0,
  errors: 0,
};

/** מפרמט שורות צ'אט לתמלול קריא למודל. */
function buildTranscript(rows: ChatRow[]): string {
  return rows
    .map((r) => {
      const speaker = r.role === 'assistant' ? 'מנטור' : r.role === 'user' ? 'משתמש' : 'מערכת';
      return `${speaker}: ${r.content.replace(/\s+/g, ' ').trim()}`;
    })
    .join('\n');
}

export async function runInsightExtraction(params: {
  admin: SupabaseClient;
  userId: string;
  /** ה-session לנתח. אם null — מנתחים את ההודעות האחרונות של המשתמש בכל ה-sessions. */
  sessionId?: string | null;
  messageLimit?: number;
  now?: Date;
}): Promise<RunInsightExtractionResult> {
  const { admin, userId } = params;
  const limit = Math.min(60, Math.max(4, params.messageLimit ?? DEFAULT_MESSAGE_LIMIT));

  // 1) שליפת ההודעות האחרונות (DESC) ואז היפוך לסדר כרונולוגי לקריאוּת המודל.
  let query = admin
    .from('ai_interactions')
    .select('role, content, created_at')
    .eq('user_id', userId)
    .in('role', ['user', 'assistant'])
    .order('created_at', { ascending: false })
    .limit(limit);
  if (params.sessionId) query = query.eq('session_id', params.sessionId);

  const { data: rows, error } = await query;
  if (error) {
    console.warn('[insights] fetch messages failed', { code: error.code, error: error.message });
    return EMPTY_RESULT;
  }

  const messages = (rows ?? []) as ChatRow[];
  if (messages.length === 0) return EMPTY_RESULT;
  const transcript = buildTranscript([...messages].reverse());

  // 2) שליפת התובנות הקיימות (למיזוג ומניעת כפילויות ע"י המודל).
  const { data: existing } = await admin
    .from('user_insights')
    .select('category, insight_text')
    .eq('user_id', userId)
    .eq('status', INSIGHT_STATUS.ACTIVE)
    .order('actionability_score', { ascending: false })
    .limit(30);

  // 3) חילוץ.
  const extraction = await extractInsights({
    transcript,
    existingInsights: (existing ?? []) as { category: string; insight_text: string }[],
  });

  if (extraction.insights.length === 0) {
    return { ...EMPTY_RESULT, messages_analyzed: messages.length };
  }

  // 4) שמירה עם מיזוג.
  const persisted = await persistInsights({
    admin,
    userId,
    extraction,
    sessionId: params.sessionId ?? null,
    now: params.now,
  });

  return {
    ...persisted,
    messages_analyzed: messages.length,
    insights_extracted: extraction.insights.length,
  };
}
