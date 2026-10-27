import { resolveReplyQuoteTurnIndex } from '@/lib/module-api/agent/lib-ai-reply-quote';

export type QuoteResolvable = {
  role: string;
  metadata?: { dbId?: string; replyToId?: string } | unknown;
};

export type ResolvedReplyQuote = { targetIndex: number | null; deleted: boolean };

function meta(m: QuoteResolvable): { dbId?: string; replyToId?: string } {
  const x = m.metadata;
  return x && typeof x === 'object' ? (x as { dbId?: string; replyToId?: string }) : {};
}

/**
 * Which earlier user message an assistant message quotes.
 * History: by stored id (missing → deleted). Live stream: by the local index n, with the same
 * policy as the server (no quoting a single latest message).
 */
export function resolveReplyQuote(
  messages: QuoteResolvable[],
  index: number,
  liveN: number | null
): ResolvedReplyQuote | null {
  const m = messages[index];
  if (!m || m.role !== 'assistant') return null;
  const replyToId = meta(m).replyToId;
  if (replyToId) {
    const t = messages.findIndex((x, k) => k < index && x.role === 'user' && meta(x).dbId === replyToId);
    return t === -1 ? { targetIndex: null, deleted: true } : { targetIndex: t, deleted: false };
  }
  if (liveN == null) return null;
  const t = resolveReplyQuoteTurnIndex(messages.slice(0, index), liveN);
  return t == null ? null : { targetIndex: t, deleted: false };
}
