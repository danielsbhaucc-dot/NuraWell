import { decInteractionResult } from '@/lib/crypto/pii-fields';
import type { SupabaseClient } from '@supabase/supabase-js';
import { parseMentorEmojiReaction } from '../emoji-reaction/marker';
import type { ChatTranscriptTurn } from './types';

function reactionFromMetadata(metadata: unknown): ChatTranscriptTurn['emoji_reaction'] {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const raw = (metadata as Record<string, unknown>).emoji_reaction;
  return parseMentorEmojiReaction(raw);
}

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
    .select('id, role, content, created_at, metadata, reply_to_message_id')
    .eq('session_id', params.sessionId)
    .eq('user_id', params.userId)
    .in('role', ['user', 'assistant']);

  const { data, error } = limit
    ? await base.order('created_at', { ascending: false }).limit(limit).then(decInteractionResult(params.userId))
    : await base.order('created_at', { ascending: true }).then(decInteractionResult(params.userId));

  if (error) throw error;

  const turns = (data ?? [])
    .map((row) => {
      const role = row.role as ChatTranscriptTurn['role'];
      const reaction =
        role === 'user' ? reactionFromMetadata(row.metadata) : null;
      return {
        role,
        ...(typeof row.id === 'string' ? { id: row.id } : {}),
        ...((role === 'assistant' || role === 'user') && typeof row.reply_to_message_id === 'string' ? { reply_to_id: row.reply_to_message_id } : {}),
        content: String(row.content ?? '').trim(),
        created_at: row.created_at as string,
        ...(reaction ? { emoji_reaction: reaction } : {}),
        ...(role === 'assistant' && (row.metadata as Record<string, unknown> | null)?.qc_edited_at ? { edited: true } : {}),
      };
    })
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

// client-safe (no crypto imports) — re-exported for server callers
export { formatTranscriptForLlm } from './format-transcript';
