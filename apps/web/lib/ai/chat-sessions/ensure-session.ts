import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChatSessionRow } from './types';

/**
 * מוודא שקיים שורת chat_sessions — יוצר אם חסר (תאימות לאחור לסשנים ישנים).
 */
export async function ensureChatSession(
  supabase: SupabaseClient,
  params: { sessionId: string; userId: string }
): Promise<ChatSessionRow> {
  const { data: existing, error: readErr } = await supabase
    .from('chat_sessions')
    .select('id, user_id, status, summary, created_at, updated_at, closed_at')
    .eq('id', params.sessionId)
    .maybeSingle();

  if (readErr) throw readErr;
  if (existing) return existing as ChatSessionRow;

  const now = new Date().toISOString();
  const { data: inserted, error: insertErr } = await supabase
    .from('chat_sessions')
    .insert({
      id: params.sessionId,
      user_id: params.userId,
      status: 'open',
      updated_at: now,
    })
    .select('id, user_id, status, summary, created_at, updated_at, closed_at')
    .single();

  if (insertErr) throw insertErr;
  return inserted as ChatSessionRow;
}

/** מעדכן חותמת פעילות — לזיהוי סשנים נטושים */
export async function touchChatSessionActivity(
  supabase: SupabaseClient,
  params: { sessionId: string; userId: string }
): Promise<void> {
  const { error } = await supabase
    .from('chat_sessions')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', params.sessionId)
    .eq('user_id', params.userId)
    .eq('status', 'open');
  if (error) throw error;
}

export async function createChatSession(
  supabase: SupabaseClient,
  userId: string
): Promise<ChatSessionRow> {
  const sessionId = crypto.randomUUID();
  return ensureChatSession(supabase, { sessionId, userId });
}
