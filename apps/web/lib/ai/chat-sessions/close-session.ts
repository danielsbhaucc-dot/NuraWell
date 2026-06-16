import type { SupabaseClient } from '@supabase/supabase-js';
import { extractMemoriesFromTranscript } from '../user-memories/extract-from-transcript';
import { reconcileSessionMemories } from '../user-memories/reconcile-session-memories';
import { fetchChatSessionTranscript, formatTranscriptForLlm } from './fetch-transcript';
import { summarizeChatSession } from './summarize-session';
import type { ChatSessionRow } from './types';

export type CloseChatSessionResult = {
  session: ChatSessionRow;
  memories_extracted: number;
  summary: string;
  memory_reconcile?: {
    inserted: number;
    refreshed: number;
    merged: number;
    superseded: number;
    errors: number;
  };
};

/**
 * סגירת סשן: סיכום AI + חילוץ זיכרונות + שמירה ל-user_memories + Upstash.
 */
export async function closeChatSession(
  supabase: SupabaseClient,
  params: { sessionId: string; userId: string }
): Promise<CloseChatSessionResult> {
  const { data: session, error: sessionErr } = await supabase
    .from('chat_sessions')
    .select('id, user_id, status, summary, created_at, updated_at, closed_at')
    .eq('id', params.sessionId)
    .eq('user_id', params.userId)
    .single();

  if (sessionErr) throw sessionErr;
  if (session.status === 'closed' && session.summary) {
    return {
      session: session as ChatSessionRow,
      memories_extracted: 0,
      summary: session.summary,
    };
  }

  const turns = await fetchChatSessionTranscript(supabase, params);
  const transcript = formatTranscriptForLlm(turns);
  const [summary, facts] = await Promise.all([
    summarizeChatSession(turns),
    extractMemoriesFromTranscript(transcript),
  ]);

  const now = new Date().toISOString();
  const { data: updated, error: updateErr } = await supabase
    .from('chat_sessions')
    .update({
      status: 'closed',
      summary,
      closed_at: now,
      updated_at: now,
    })
    .eq('id', params.sessionId)
    .eq('user_id', params.userId)
    .select('id, user_id, status, summary, created_at, updated_at, closed_at')
    .single();

  if (updateErr) throw updateErr;

  const memoryReconcile = await reconcileSessionMemories({
    userId: params.userId,
    facts,
    sourceSessionId: params.sessionId,
  });

  const memoriesExtracted =
    memoryReconcile.inserted +
    memoryReconcile.refreshed +
    memoryReconcile.merged;

  return {
    session: updated as ChatSessionRow,
    memories_extracted: memoriesExtracted,
    summary,
    memory_reconcile: memoryReconcile,
  };
}
