import type { SupabaseClient } from '@supabase/supabase-js';

export type ChatSessionListItem = {
  id: string;
  status: 'open' | 'closed';
  summary: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  preview_text: string | null;
  message_count: number;
};

function truncatePreview(text: string, max = 88): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

/** כותרת לרשימת שיחות — טהור, ניתן לבדיקה */
export function buildChatSessionListTitle(item: {
  summary: string | null;
  preview_text: string | null;
  created_at: string;
}): string {
  if (item.summary?.trim()) return truncatePreview(item.summary, 72);
  if (item.preview_text?.trim()) return truncatePreview(item.preview_text, 72);
  try {
    const d = new Date(item.created_at);
    const label = new Intl.DateTimeFormat('he-IL', {
      day: 'numeric',
      month: 'short',
    }).format(d);
    return `שיחה מ-${label}`;
  } catch {
    return 'שיחה עם אלמוג';
  }
}

export async function listChatSessionsForUser(
  supabase: SupabaseClient,
  userId: string,
  limit = 40
): Promise<ChatSessionListItem[]> {
  const { data: sessions, error } = await supabase
    .from('chat_sessions')
    .select('id, status, summary, created_at, updated_at, closed_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  const rows = sessions ?? [];
  if (!rows.length) return [];

  const sessionIds = rows.map((r) => r.id as string);
  const { data: interactions, error: intErr } = await supabase
    .from('ai_interactions')
    .select('session_id, role, content, created_at')
    .eq('user_id', userId)
    .in('session_id', sessionIds)
    .in('role', ['user', 'assistant'])
    .order('created_at', { ascending: false });

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

  return rows.map((row) => ({
    id: row.id as string,
    status: row.status as 'open' | 'closed',
    summary: (row.summary as string | null) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    closed_at: (row.closed_at as string | null) ?? null,
    preview_text: previewBySession.get(row.id as string) ?? null,
    message_count: countBySession.get(row.id as string) ?? 0,
  }));
}
