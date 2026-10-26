/**
 * Summary-backed history: when the session already has a rolling summary (chat_sessions.live_conversation_file,
 * injected into the prompt as the session "live file"), only the most recent turns are sent verbatim; the
 * older turns are represented by that summary. With no summary, the full window is kept (no information loss).
 *
 * Default tail = 16 messages (8 user/assistant rounds). Tunable via AI_CHAT_VERBATIM_TAIL (6..50).
 */
export function verbatimTailSize(): number {
  const n = Number(process.env.AI_CHAT_VERBATIM_TAIL?.trim());
  return Number.isFinite(n) && n >= 6 && n <= 50 ? Math.floor(n) : 16;
}

export function keepVerbatimTailWhenSummarized<T extends { role: string; content: string }>(
  msgs: T[],
  hasSessionSummary: boolean,
  tail = verbatimTailSize()
): T[] {
  if (!hasSessionSummary || msgs.length <= tail) return msgs;
  const out = msgs.slice(-tail);
  // never open on an assistant turn
  while (out.length > 1 && out[0]!.role === 'assistant') out.shift();
  return out;
}
