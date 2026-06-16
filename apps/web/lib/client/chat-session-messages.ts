import type { ChatTranscriptTurn } from '../ai/chat-sessions/types';

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
  try {
    const date = new Date(iso);
    const now = Date.now();
    const diffMs = now - date.getTime();
    const mins = Math.floor(diffMs / 60_000);
    if (mins < 1) return 'עכשיו';
    if (mins < 60) return `לפני ${mins} דק׳`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `לפני ${hours} ש׳`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `לפני ${days} ימים`;
    return new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'short' }).format(date);
  } catch {
    return '';
  }
}
