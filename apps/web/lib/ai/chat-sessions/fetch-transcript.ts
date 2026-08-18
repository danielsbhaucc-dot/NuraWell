import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChatTranscriptTurn } from './types';

export async function fetchChatSessionTranscript(
  supabase: SupabaseClient,
  params: { sessionId: string; userId: string; limit?: number }
): Promise<ChatTranscriptTurn[]> {
  const limit =
    typeof params.limit === 'number' && params.limit > 0
      ? Math.min(Math.floor(params.limit), 500)
      : null;

  const base = supabase
    .from('ai_interactions')
    .select('role, content, created_at')
    .eq('session_id', params.sessionId)
    .eq('user_id', params.userId)
    .in('role', ['user', 'assistant']);

  const { data, error } = limit
    ? await base.order('created_at', { ascending: false }).limit(limit)
    : await base.order('created_at', { ascending: true });

  if (error) throw error;

  const turns = (data ?? [])
    .map((row) => ({
      role: row.role as ChatTranscriptTurn['role'],
      content: String(row.content ?? '').trim(),
      created_at: row.created_at as string,
    }))
    .filter((t) => t.content.length > 0);

  if (limit) turns.reverse();
  return turns;
}

export type WriterChatTurn = { role: 'user' | 'assistant'; content: string };

/**
 * מקור האמת להיסטוריה הוא התמליל ב-DB, לא רק מה שהלקוח שלח.
 * useChat לפעמים שולח תור בודד אחרי רענון/פתיחת שיחה — ואז אלמוג "מתאפס".
 */
export function mergeTranscriptWithClientMessages(opts: {
  dbTurns: ChatTranscriptTurn[];
  clientTurns: WriterChatTurn[];
  lastUserText: string;
  windowSize: number;
}): WriterChatTurn[] {
  const fromDb: WriterChatTurn[] = opts.dbTurns
    .filter((t): t is ChatTranscriptTurn & { role: 'user' | 'assistant' } =>
      t.role === 'user' || t.role === 'assistant'
    )
    .map((t) => ({ role: t.role, content: t.content }));
  const base = fromDb.length >= opts.clientTurns.length ? fromDb : opts.clientTurns;
  const next = [...base];
  const last = next[next.length - 1];
  if (!last || last.role !== 'user' || last.content !== opts.lastUserText) {
    next.push({ role: 'user', content: opts.lastUserText });
  }
  return next.slice(-Math.max(2, opts.windowSize));
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
