import type { ChatTranscriptTurn } from '../ai/chat-sessions/types';

import { formatHebrewRelative } from '../../lib/time/hebrew-relative';

export type ChatHistoryUiMessage = {
  id: string;
  role: 'user' | 'assistant';
  parts: Array<{ type: 'text'; text: string }>;
  createdAt: string;
};

/** ממיר תמליל Supabase לפורמט useChat */
export function transcriptTurnsToUiMessages(turns: ChatTranscriptTurn[]): ChatHistoryUiMessage[] {
  return turns.map((turn, index) => ({
    id: `hist-${index}-${turn.created_at}`,
    role: turn.role === 'assistant' ? 'assistant' : 'user',
    parts: [{ type: 'text', text: turn.content }],
    createdAt: turn.created_at,
  }));
}

export function formatSessionRelativeTime(iso: string): string {
  return formatHebrewRelative(iso);
}
