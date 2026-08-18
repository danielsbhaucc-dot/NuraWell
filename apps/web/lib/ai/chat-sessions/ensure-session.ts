import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChatSessionRow } from './types';
import {
  normalizeChatSessionRow,
  selectChatSessionRow,
} from './select-fallbacks';

/**
 * מוודא שקיים שורת chat_sessions — יוצר אם חסר (תאימות לאחור לסשנים ישנים).
 */
export async function ensureChatSession(
  supabase: SupabaseClient,
  params: { sessionId: string; userId: string }
): Promise<ChatSessionRow> {
  const { data: existing, error: readErr } = await selectChatSessionRow(supabase, params);
  if (readErr) throw readErr;
  if (existing) return normalizeChatSessionRow(existing);

  const now = new Date().toISOString();
  const { error: insertErr } = await supabase.from('chat_sessions').insert({
    id: params.sessionId,
    user_id: params.userId,
    status: 'open',
    updated_at: now,
  });
  if (insertErr) throw insertErr;

  const { data: inserted, error: reloadErr } = await selectChatSessionRow(supabase, params);
  if (reloadErr) throw reloadErr;
  if (!inserted) throw new Error('chat_session_insert_missing_row');
  return normalizeChatSessionRow(inserted);
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

/** מעדכן מונה הודעות + תצוגה מקדימה בלי JOIN בטעינת הרשימה */
export async function bumpChatSessionTurn(
  supabase: SupabaseClient,
  params: { sessionId: string; userId: string; preview: string }
): Promise<void> {
  const preview = params.preview.replace(/\s+/g, ' ').trim().slice(0, 280);
  const { error } = await supabase.rpc('bump_chat_session_turn', {
    p_session_id: params.sessionId,
    p_user_id: params.userId,
    p_preview: preview,
  });
  if (!error) return;

  await supabase
    .from('chat_sessions')
    .update({
      preview_text: preview || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.sessionId)
    .eq('user_id', params.userId);
}

export async function createChatSession(
  supabase: SupabaseClient,
  userId: string
): Promise<ChatSessionRow> {
  const sessionId = crypto.randomUUID();
  return ensureChatSession(supabase, { sessionId, userId });
}
