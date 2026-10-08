import type { ChatTranscriptTurn } from '../ai/chat-sessions/types';
import type { MentorEmojiReaction } from '../ai/emoji-reaction/types';

import { formatHebrewRelative } from '../../lib/time/hebrew-relative';

export type ChatHistoryUiMessage = {
  id: string;
  role: 'user' | 'assistant';
  parts: Array<{ type: 'text'; text: string }>;
  createdAt: string;
  metadata?: {
    emojiReaction?: MentorEmojiReaction;
  };
};

/** ממיר תמליל Supabase לפורמט useChat */
export function transcriptTurnsToUiMessages(turns: ChatTranscriptTurn[]): ChatHistoryUiMessage[] {
  return turns.map((turn, index) => {
    const role = turn.role === 'assistant' ? 'assistant' : 'user';
    const emojiReaction =
      role === 'user' && turn.emoji_reaction
        ? {
            emoji: turn.emoji_reaction.emoji,
            verb: turn.emoji_reaction.verb,
          }
        : undefined;
    return {
      id: `hist-${index}-${turn.created_at}`,
      role,
      parts: [{ type: 'text', text: turn.content }],
      createdAt: turn.created_at,
      ...(emojiReaction ? { metadata: { emojiReaction } } : {}),
    };
  });
}

export function formatSessionRelativeTime(iso: string): string {
  return formatHebrewRelative(iso);
}
