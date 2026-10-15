import { sealTableRow } from '@/lib/crypto/pii-seal';
import { decProfileResult } from '@/lib/crypto/pii-fields';
import { withAiUser } from '@/lib/ai/usage-meter';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ingestConversationToVector } from '../chat-memory/conversation-vector';
import { rollupUserChatContext } from '../chat-memory/session-conversation-file';
import { reconcileSessionMemories } from '../user-memories/reconcile-session-memories';
import { fetchChatSessionTranscript } from './fetch-transcript';
import {
  CHAT_SESSION_CLOSE_SELECTS,
  isMissingColumnError,
  normalizeChatSessionRow,
  queryWithColumnFallbacks,
  selectChatSessionRow,
} from './select-fallbacks';
import { sanitizeChatSessionTitle, titleFromSummaryFallback } from './session-title';
import { buildCloseDigest } from './close-digest';
import type { ChatSessionRow } from './types';
import type { ChatCloseReason } from './close-reason';

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
  params: { sessionId: string; userId: string; reason?: ChatCloseReason }
): Promise<CloseChatSessionResult> {
  const { data: session, error: sessionErr } = await selectChatSessionRow(
    supabase,
    params,
    CHAT_SESSION_CLOSE_SELECTS
  );

  if (sessionErr) throw sessionErr;
  if (!session) throw new Error('chat_session_not_found');
  const normalized = normalizeChatSessionRow(session);
  if (normalized.status === 'closed' && normalized.summary) {
    return {
      session: normalized,
      memories_extracted: 0,
      summary: normalized.summary,
      vectors_ingested: 0,
    };
  }

  const turns = await fetchChatSessionTranscript(supabase, params);
  const existingTitle = sanitizeChatSessionTitle(normalized.title);
  // one structured LLM call (summary + facts + title if missing); none at all for trivial chats
  const digest = await withAiUser(params.userId, () =>
    buildCloseDigest(turns, { needTitle: !existingTitle, liveFile: normalized.live_conversation_file })
  );
  const { summary, facts } = digest;
  const now = new Date().toISOString();
  const title = existingTitle ?? digest.title ?? titleFromSummaryFallback(summary);

  const updatePayload: Record<string, unknown> = {
    status: 'closed',
    summary,
    closed_at: now,
    updated_at: now,
    close_reason: params.reason ?? 'user',
  };
  if (title) updatePayload.title = title;

  let updatedResult = await queryWithColumnFallbacks<Record<string, unknown>>(
    CHAT_SESSION_CLOSE_SELECTS,
    (select) =>
      supabase
        .from('chat_sessions')
        .update(await sealTableRow('chat_sessions', updatePayload, params.userId))
        .eq('id', params.sessionId)
        .eq('user_id', params.userId)
        .select(select)
        .single()
  );

  if (updatedResult.error && isMissingColumnError(updatedResult.error)) {
    // older schema: drop optional columns (title / close_reason) and retry
    const { title: _title, close_reason: _reason, ...withoutTitle } = updatePayload;
    updatedResult = await queryWithColumnFallbacks<Record<string, unknown>>(
      CHAT_SESSION_CLOSE_SELECTS,
      (select) =>
        supabase
          .from('chat_sessions')
          .update(await sealTableRow('chat_sessions', withoutTitle, params.userId))
          .eq('id', params.sessionId)
          .eq('user_id', params.userId)
          .select(select)
          .single()
    );
  }

  if (updatedResult.error) throw updatedResult.error;
  const updated = normalizeChatSessionRow(updatedResult.data!);

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
      liveFile: normalized.live_conversation_file,
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
      .maybeSingle().then(decProfileResult(params.userId));
    const prevRollup = (prof?.ai_context as { chat_summary?: string } | null)?.chat_summary;
    await withAiUser(params.userId, () => rollupUserChatContext(supabase, {
      userId: params.userId,
      sessionSummary: summary,
      sessionClosedAt: now,
      previousRollup: prevRollup,
    }));
  } catch (rollupErr) {
    console.warn('[closeChatSession] rollup failed', {
      sessionId: params.sessionId,
      error: rollupErr instanceof Error ? rollupErr.message : String(rollupErr),
    });
  }

  return {
    session: updated,
    memories_extracted: memoriesExtracted,
    summary,
    vectors_ingested: vectorsIngested,
    memory_reconcile: memoryReconcile,
  };
}
