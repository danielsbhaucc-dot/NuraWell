import type { SupabaseClient } from '@supabase/supabase-js';
import { ingestConversationToVector } from '../chat-memory/conversation-vector';
import { rollupUserChatContext } from '../chat-memory/session-conversation-file';
import { extractMemoriesFromTranscript } from '../user-memories/extract-from-transcript';
import { reconcileSessionMemories } from '../user-memories/reconcile-session-memories';
import { fetchChatSessionTranscript, formatTranscriptForLlm } from './fetch-transcript';
import { generateChatSessionTitle, sanitizeChatSessionTitle, titleFromSummaryFallback } from './session-title';
import { summarizeChatSession } from './summarize-session';
import type { ChatSessionRow } from './types';

export type CloseChatSessionResult = {
  session: ChatSessionRow;
  memories_extracted: number;
  summary: string;
  vectors_ingested: number;
  memory_reconcile?: {
    inserted: number;
    refreshed: number;
    merged: number;
    superseded: number;
    errors: number;
  };
};

/**
 * סגירת סשן: סיכום AI + חילוץ זיכרונות + Upstash + אינדקס שיחות.
 */
export async function closeChatSession(
  supabase: SupabaseClient,
  params: { sessionId: string; userId: string }
): Promise<CloseChatSessionResult> {
  const { data: session, error: sessionErr } = await supabase
    .from('chat_sessions')
    .select(
      'id, user_id, status, title, summary, live_conversation_file, created_at, updated_at, closed_at'
    )
    .eq('id', params.sessionId)
    .eq('user_id', params.userId)
    .single();

  if (sessionErr) throw sessionErr;
  if (session.status === 'closed' && session.summary) {
    return {
      session: session as ChatSessionRow,
      memories_extracted: 0,
      summary: session.summary,
      vectors_ingested: 0,
    };
  }

  const turns = await fetchChatSessionTranscript(supabase, params);
  const transcript = formatTranscriptForLlm(turns);
  const [summary, facts] = await Promise.all([
    summarizeChatSession(turns),
    extractMemoriesFromTranscript(transcript),
  ]);

  const now = new Date().toISOString();
  const existingTitle = sanitizeChatSessionTitle(session.title as string | null);
  let title = existingTitle;
  if (!title) {
    const firstUser = turns.find((t) => t.role === 'user')?.content ?? '';
    title =
      (await generateChatSessionTitle({
        userMessage: firstUser,
        liveFile: session.live_conversation_file as string | null,
      })) ?? titleFromSummaryFallback(summary);
  }

  const { data: updated, error: updateErr } = await supabase
    .from('chat_sessions')
    .update({
      status: 'closed',
      summary,
      ...(title ? { title } : {}),
      closed_at: now,
      updated_at: now,
    })
    .eq('id', params.sessionId)
    .eq('user_id', params.userId)
    .select(
      'id, user_id, status, title, summary, live_conversation_file, created_at, updated_at, closed_at'
    )
    .single();

  if (updateErr) throw updateErr;

  const memoryReconcile = await reconcileSessionMemories({
    userId: params.userId,
    facts,
    sourceSessionId: params.sessionId,
  });

  const memoriesExtracted =
    memoryReconcile.inserted + memoryReconcile.refreshed + memoryReconcile.merged;

  let vectorsIngested = 0;
  try {
    vectorsIngested = await ingestConversationToVector({
      userId: params.userId,
      sessionId: params.sessionId,
      summary,
      liveFile: session.live_conversation_file as string | null,
      closedAt: now,
    });
  } catch (vecErr) {
    console.warn('[closeChatSession] vector ingest failed', {
      sessionId: params.sessionId,
      error: vecErr instanceof Error ? vecErr.message : String(vecErr),
    });
  }

  try {
    const { data: prof } = await supabase
      .from('profiles')
      .select('ai_context')
      .eq('id', params.userId)
      .maybeSingle();
    const prevRollup = (prof?.ai_context as { chat_summary?: string } | null)?.chat_summary;
    await rollupUserChatContext(supabase, {
      userId: params.userId,
      sessionSummary: summary,
      sessionClosedAt: now,
      previousRollup: prevRollup,
    });
  } catch (rollupErr) {
    console.warn('[closeChatSession] rollup failed', {
      sessionId: params.sessionId,
      error: rollupErr instanceof Error ? rollupErr.message : String(rollupErr),
    });
  }

  return {
    session: updated as ChatSessionRow,
    memories_extracted: memoriesExtracted,
    summary,
    vectors_ingested: vectorsIngested,
    memory_reconcile: memoryReconcile,
  };
}
