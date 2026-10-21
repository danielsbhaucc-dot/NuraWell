import type { ChatTranscriptTurn } from './types';

/** Pure formatter, safe for client bundles (must not import crypto / pii). */
export function formatTranscriptForLlm(turns: ChatTranscriptTurn[]): string {
  if (!turns.length) return '';
  return turns
    .map((t) => {
      const who = t.role === 'user' ? 'משתמש' : 'אלמוג';
      return `${who}: ${t.content}`;
    })
    .join('\n\n');
}
