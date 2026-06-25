import type { SupabaseClient } from '@supabase/supabase-js';
import { ensureChatSession } from './ensure-session';
import { buildChatSessionListTitle } from './session-list-title';

export { buildChatSessionListTitle };

export type ChatSessionKind = 'chat' | 'profile_update';

export type ChatSessionListItem = {
  id: string;
  status: 'open' | 'closed';
  session_kind: ChatSessionKind;
  summary: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  preview_text: string | null;
  message_count: number;
};

/** מוודא שורות chat_sessions לסשנים ישנים שיש להם ai_interactions בלבד */
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
  for (const row of data ?? []) {
    const sessionId = row.session_id as string;
    if (!sessionId || seen.has(sessionId)) continue;
    seen.add(sessionId);
    await ensureChatSession(supabase, { sessionId, userId }).catch(() => {
      /* לא שוברים רשימה אם שורה בודדת נכשלה */
    });
    if (seen.size >= maxSessions) break;
  }
}

export async function listChatSessionsForUser(
  supabase: SupabaseClient,
  userId: string,
  limit = 40
): Promise<ChatSessionListItem[]> {
  await backfillLegacySessionsFromInteractions(supabase, userId, limit);

  const { data: sessions, error } = await supabase
    .from('chat_sessions')
    .select('id, status, session_kind, summary, created_at, updated_at, closed_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  const rows = sessions ?? [];

  const sessionIds =
    rows.length > 0
      ? rows.map((r) => r.id as string)
      : [];

  const { data: interactions, error: intErr } =
    sessionIds.length > 0
      ? await supabase
          .from('ai_interactions')
          .select('session_id, role, content, created_at')
          .eq('user_id', userId)
          .in('session_id', sessionIds)
          .in('role', ['user', 'assistant'])
          .order('created_at', { ascending: false })
      : { data: [], error: null };

  if (intErr) throw intErr;

  const previewBySession = new Map<string, string>();
  const countBySession = new Map<string, number>();

  for (const row of interactions ?? []) {
    const sid = row.session_id as string;
    countBySession.set(sid, (countBySession.get(sid) ?? 0) + 1);
    if (!previewBySession.has(sid)) {
      const content = String(row.content ?? '').trim();
      if (content) previewBySession.set(sid, content);
    }
  }

  return rows.map((row) => {
    const kind = (row.session_kind as ChatSessionKind | null) ?? 'chat';
    return {
      id: row.id as string,
      status: row.status as 'open' | 'closed',
      session_kind: kind,
      summary: (row.summary as string | null) ?? null,
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
      closed_at: (row.closed_at as string | null) ?? null,
      preview_text: kind === 'profile_update' ? null : previewBySession.get(row.id as string) ?? null,
      message_count: kind === 'profile_update' ? 0 : countBySession.get(row.id as string) ?? 0,
    };
  });
}
