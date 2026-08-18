import type { SupabaseClient } from '@supabase/supabase-js';
import { ensureChatSession } from './ensure-session';

export { buildChatSessionListTitle } from './session-list-title';

export type ChatSessionKind = 'chat' | 'profile_update';

export type ChatSessionListItem = {
  id: string;
  status: 'open' | 'closed';
  session_kind: ChatSessionKind;
  title: string | null;
  summary: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  preview_text: string | null;
  message_count: number;
};

const SESSION_LIST_COLUMNS =
  'id, status, session_kind, title, summary, preview_text, message_count, created_at, updated_at, closed_at';

/** מוודא שורות chat_sessions לסשנים ישנים שיש להם ai_interactions בלבד */
async function backfillLegacySessionsFromInteractions(
  supabase: SupabaseClient,
  userId: string,
  maxSessions = 40
): Promise<void> {
  const { count, error: countErr } = await supabase
    .from('chat_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);

  if (countErr) throw countErr;
  if ((count ?? 0) > 0) return;

  const { data, error } = await supabase
    .from('ai_interactions')
    .select('session_id, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(250);

  if (error) throw error;

  const seen = new Set<string>();
  const toEnsure: string[] = [];
  for (const row of data ?? []) {
    const sessionId = row.session_id as string;
    if (!sessionId || seen.has(sessionId)) continue;
    seen.add(sessionId);
    toEnsure.push(sessionId);
    if (toEnsure.length >= maxSessions) break;
  }

  await Promise.all(
    toEnsure.map((sessionId) =>
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

  const { data: sessions, error } = await supabase
    .from('chat_sessions')
    .select(SESSION_LIST_COLUMNS)
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (error) throw error;

  return (sessions ?? []).map((row) => {
    const kind = (row.session_kind as ChatSessionKind | null) ?? 'chat';
    return {
      id: row.id as string,
      status: row.status as 'open' | 'closed',
      session_kind: kind,
      title: (row.title as string | null) ?? null,
      summary: (row.summary as string | null) ?? null,
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
      closed_at: (row.closed_at as string | null) ?? null,
      preview_text: kind === 'profile_update' ? null : ((row.preview_text as string | null) ?? null),
      message_count: kind === 'profile_update' ? 0 : Number(row.message_count ?? 0),
    };
  });
}
