/**
 * שומר תגובת אימוג'י על הודעת המשתמש האחרונה בסשן (metadata).
 */

import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import type { MentorEmojiReaction } from './types';

export async function persistUserEmojiReaction(
  supabase: SupabaseClient,
  params: {
    sessionId: string;
    userId: string;
    userMessage: string;
    reaction: MentorEmojiReaction;
  }
): Promise<void> {
  const { data: rows, error } = await supabase
    .from('ai_interactions')
    .select('id, metadata, content')
    .eq('session_id', params.sessionId)
    .eq('user_id', params.userId)
    .eq('role', 'user')
    .order('created_at', { ascending: false })
    .limit(6);

  if (error) throw error;

  const target = (rows ?? []).find(
    (row) => String(row.content ?? '').trim() === params.userMessage.trim()
  ) ?? rows?.[0];

  if (!target?.id) return;

  const prev =
    target.metadata && typeof target.metadata === 'object' && !Array.isArray(target.metadata)
      ? (target.metadata as Record<string, unknown>)
      : {};

  const { error: updateErr } = await supabase
    .from('ai_interactions')
    .update({
      metadata: {
        ...prev,
        emoji_reaction: {
          emoji: params.reaction.emoji,
          verb: params.reaction.verb,
        },
      },
    })
    .eq('id', target.id)
    .eq('user_id', params.userId);

  if (updateErr) throw updateErr;
}
