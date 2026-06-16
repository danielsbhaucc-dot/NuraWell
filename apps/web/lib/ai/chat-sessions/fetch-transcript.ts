import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChatTranscriptTurn } from './types';

export async function fetchChatSessionTranscript(
  supabase: SupabaseClient,
  params: { sessionId: string; userId: string }
): Promise<ChatTranscriptTurn[]> {
  const { data, error } = await supabase
    .from('ai_interactions')
    .select('role, content, created_at')
    .eq('session_id', params.sessionId)
    .eq('user_id', params.userId)
    .in('role', ['user', 'assistant'])
    .order('created_at', { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    role: row.role as ChatTranscriptTurn['role'],
    content: String(row.content ?? '').trim(),
    created_at: row.created_at as string,
  })).filter((t) => t.content.length > 0);
}

export function formatTranscriptForLlm(turns: ChatTranscriptTurn[]): string {
  if (!turns.length) return '';
  return turns
    .map((t) => {
      const who = t.role === 'user' ? 'משתמש' : 'אלמוג';
      return `${who}: ${t.content}`;
    })
    .join('\n\n');
}
