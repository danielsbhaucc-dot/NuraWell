import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * מוחק שיחה ותמליל שלה. זיכרונות מחולצים (user_memories) נשארים.
 */
export async function deleteChatSession(
  supabase: SupabaseClient,
  params: { sessionId: string; userId: string }
): Promise<void> {
  const { error: intErr } = await supabase
    .from('ai_interactions')
    .delete()
    .eq('session_id', params.sessionId)
    .eq('user_id', params.userId);
  if (intErr) throw intErr;

  const { error: sessionErr } = await supabase
    .from('chat_sessions')
    .delete()
    .eq('id', params.sessionId)
    .eq('user_id', params.userId);
  if (sessionErr) throw sessionErr;

  try {
    const { deleteConversationVectors } = await import('../chat-memory/conversation-vector');
    await deleteConversationVectors({
      userId: params.userId,
      sessionId: params.sessionId,
    });
  } catch (vecErr) {
    console.warn('[deleteChatSession] vector cleanup failed', {
      sessionId: params.sessionId,
      error: vecErr instanceof Error ? vecErr.message : String(vecErr),
    });
  }
}
