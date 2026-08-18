import type { SupabaseClient } from '@supabase/supabase-js';
import { ensureChatSession } from './ensure-session';
import {
  normalizeChatSessionListItem,
  selectUserChatSessionList,
} from './select-fallbacks';
import type { ChatSessionListItem } from './types';

export { buildChatSessionListTitle } from './session-list-title';
export type { ChatSessionKind, ChatSessionListItem } from './types';

/** מוודא שורות chat_sessions לסשנים ישנים שיש להם ai_interactions בלי שורת סשן */
async function backfillLegacySessionsFromInteractions(
  supabase: SupabaseClient,
  userId: string,
  maxSessions = 40
): Promise<void> {
  const { data, error } = await supabase
    .from('ai_interactions')
    .select('session_id, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(250);

  if (error) throw error;

  const seen = new Set<string>();
  const candidateIds: string[] = [];
  for (const row of data ?? []) {
    const sessionId = row.session_id as string;
    if (!sessionId || seen.has(sessionId)) continue;
    seen.add(sessionId);
    candidateIds.push(sessionId);
    if (candidateIds.length >= maxSessions) break;
  }
  if (!candidateIds.length) return;

  const { data: existingRows, error: existingErr } = await supabase
    .from('chat_sessions')
    .select('id')
    .eq('user_id', userId)
    .in('id', candidateIds);

  if (existingErr) throw existingErr;

  const existingIds = new Set((existingRows ?? []).map((row) => row.id as string));
  const missingIds = candidateIds.filter((id) => !existingIds.has(id));
  if (!missingIds.length) return;

  await Promise.all(
    missingIds.map((sessionId) =>
      ensureChatSession(supabase, { sessionId, userId }).catch(() => {
        /* לא שוברים רשימה אם שורה בודדת נכשלה */
      })
    )
  );
}

export async function listChatSessionsForUser(
  supabase: SupabaseClient,
  userId: string,
  limit = 40
): Promise<ChatSessionListItem[]> {
  await backfillLegacySessionsFromInteractions(supabase, userId, limit);

  const { data: sessions, error } = await selectUserChatSessionList(supabase, userId, limit);

  if (error) throw error;

  return (sessions ?? []).map((row) => normalizeChatSessionListItem(row));
}
