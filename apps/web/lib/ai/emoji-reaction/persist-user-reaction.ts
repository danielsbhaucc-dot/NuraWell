import { decInteractionResult } from '@/lib/crypto/pii-fields';
/**
 * שומר תגובת אימוג'י על הודעת המשתמש האחרונה בסשן (metadata).
 */

import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import type { EmojiReactionFix } from './marker';
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
    .limit(6).then(decInteractionResult(params.userId));

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

/**
 * אלמוג מתקן/מסיר תגובה שכבר שם: חל על הודעת המשתמש האחרונה שיש לה תגובה,
 * חוץ מההודעה הנוכחית (שהתגובה שלה נקבעת בנפרד בתור הזה).
 */
export async function applyEmojiReactionFix(
  supabase: SupabaseClient,
  params: { sessionId: string; userId: string; currentUserMessage: string; fix: EmojiReactionFix }
): Promise<{ applied: boolean }> {
  const { data: rows, error } = await supabase
    .from('ai_interactions')
    .select('id, metadata, content')
    .eq('session_id', params.sessionId)
    .eq('user_id', params.userId)
    .eq('role', 'user')
    .order('created_at', { ascending: false })
    .limit(8).then(decInteractionResult(params.userId));
  if (error) throw error;

  const current = params.currentUserMessage.trim();
  const target = (rows ?? []).find((row) => {
    if (String(row.content ?? '').trim() === current) return false;
    const meta = row.metadata as Record<string, unknown> | null;
    return Boolean(meta && typeof meta === 'object' && meta.emoji_reaction);
  });
  if (!target?.id) return { applied: false };

  const prev = { ...(target.metadata as Record<string, unknown>) };
  if (params.fix.action === 'remove') {
    delete prev.emoji_reaction;
    prev.emoji_reaction_removed_at = new Date().toISOString();
  } else {
    prev.emoji_reaction = { emoji: params.fix.reaction.emoji, verb: params.fix.reaction.verb };
    prev.emoji_reaction_edited_at = new Date().toISOString();
  }
  const { error: updateErr } = await supabase
    .from('ai_interactions')
    .update({ metadata: prev })
    .eq('id', target.id)
    .eq('user_id', params.userId);
  if (updateErr) throw updateErr;
  return { applied: true };
}

/** בלוק קצר לפרומפט — רק כשיש תגובה קודמת (חוסך טוקנים כשאין). */
export function buildPreviousReactionPromptBlock(
  turns: Array<{ role: string; content: string; emoji_reaction?: MentorEmojiReaction | null }>,
  currentUserMessage: string
): string | null {
  const current = currentUserMessage.trim();
  for (let i = turns.length - 1; i >= 0; i -= 1) {
    const t = turns[i]!;
    if (t.role !== 'user' || t.content.trim() === current) continue;
    if (!t.emoji_reaction?.emoji) continue;
    const snippet = t.content.replace(/\s+/g, ' ').trim().slice(0, 70);
    return [
      '— האימוג׳י האחרון ששמת —',
      `שמת ${t.emoji_reaction.emoji} על ההודעה: "${snippet}".`,
      'אם המשתמש מעיר על האימוג׳י, או שאתה קולט שהוא לא התאים (למשל משהו מצחיק על נושא רגיש), אפשר לתקן בשקט: בסוף התשובה הוסף ⟦NW_RX_FIX:{"e":"🙏"}⟧ כדי להחליף, או ⟦NW_RX_FIX:{"remove":true}⟧ כדי להסיר. אפשר גם להגיד במילים משהו קצר וטבעי. אם הכל בסדר, אל תוסיף כלום.',
    ].join('\n');
  }
  return null;
}
