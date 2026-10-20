import { describe, it, expect } from 'vitest';
import {
  buildReplyQuotePromptBlock,
  extractReplyQuoteIndex,
  isReplyQuoteAllowed,
  resolveReplyQuoteTurnIndex,
  stripReplyQuoteMarker,
} from '@/lib/ai/reply-quote';
import { resolveReplyQuote } from '@/lib/client/reply-quote-resolve';
import { extractDisplayTextFromChatMessage } from '@/lib/client/chat-message-display';

const u = (content: string) => ({ role: 'user', content });
const a = (content: string) => ({ role: 'assistant', content });

describe('Almog reply quoting: when NOT to quote (eval of simple single-message turns)', () => {
  const singles = [
    [u('היי, מה שלומך?')],
    [u('היי'), a('היי! איך עובר היום?'), u('בסדר, קצת עייף')],
    [u('שאלה'), a('כן?'), u('כמה מים לשתות?')],
  ];
  it.each(singles.map((t, i) => [i, t] as const))('case %i: no prompt block, and n=1 is rejected', (_i, turns) => {
    expect(buildReplyQuotePromptBlock(turns)).toBeNull();
    expect(isReplyQuoteAllowed(turns, 1)).toBe(false);
  });
});

describe('Almog reply quoting: when quoting is allowed', () => {
  it('burst: may quote any message of the burst, prompt block lists them', () => {
    const turns = [a('בוקר טוב'), u('אכלתי פיצה'), u('וגם שאלה, כמה מים לשתות?')];
    const block = buildReplyQuotePromptBlock(turns)!;
    expect(block).toContain('⟦NW_RQ:n⟧');
    expect(block).toContain('[1] "וגם שאלה');
    expect(block).toContain('[2] "אכלתי פיצה"');
    expect(resolveReplyQuoteTurnIndex(turns, 1)).toBe(2);
    expect(resolveReplyQuoteTurnIndex(turns, 2)).toBe(1);
  });
  it('older question after topic moved on', () => {
    const turns = [u('איך לישון יותר טוב?'), a('...'), u('ומה עם ארוחת ערב?'), a('...'), u('אוקיי תודה')];
    expect(buildReplyQuotePromptBlock(turns)).not.toBeNull();
    expect(resolveReplyQuoteTurnIndex(turns, 3)).toBe(0);
    expect(isReplyQuoteAllowed(turns, 1)).toBe(false);
    expect(isReplyQuoteAllowed(turns, 4)).toBe(false);
    expect(isReplyQuoteAllowed(turns, 9)).toBe(false);
  });
});

describe('marker protocol', () => {
  it('extracts and strips, including partial markers mid-stream', () => {
    expect(extractReplyQuoteIndex('⟦NW_RQ:2⟧ תשובה')).toBe(2);
    expect(extractReplyQuoteIndex('⟦NW_RQ:0⟧')).toBeNull();
    expect(extractReplyQuoteIndex('טקסט רגיל')).toBeNull();
    expect(stripReplyQuoteMarker('⟦NW_RQ:2⟧ תשובה')).toBe('תשובה');
    expect(stripReplyQuoteMarker('⟦NW_R')).toBe('');
    expect(stripReplyQuoteMarker('⟦NW_RQ:1')).toBe('');
  });
  it('display text never shows the marker', () => {
    expect(extractDisplayTextFromChatMessage({ role: 'assistant', parts: [{ type: 'text', text: '⟦NW_RQ:2⟧שלום' }] })).toBe('שלום');
  });
});

describe('client resolution', () => {
  it('history uses stored id; missing original renders as deleted', () => {
    const msgs = [
      { role: 'user', metadata: { dbId: 'x1' } },
      { role: 'user', metadata: { dbId: 'x2' } },
      { role: 'assistant', metadata: { replyToId: 'x1' } },
      { role: 'assistant', metadata: { replyToId: 'gone' } },
    ];
    expect(resolveReplyQuote(msgs, 2, null)).toEqual({ targetIndex: 0, deleted: false });
    expect(resolveReplyQuote(msgs, 3, null)).toEqual({ targetIndex: null, deleted: true });
  });
  it('live uses local index with the same policy', () => {
    const msgs = [{ role: 'assistant' }, { role: 'user' }, { role: 'assistant' }];
    expect(resolveReplyQuote(msgs, 2, 1)).toBeNull();
    const burst = [{ role: 'user' }, { role: 'user' }, { role: 'assistant' }];
    expect(resolveReplyQuote(burst, 2, 2)).toEqual({ targetIndex: 0, deleted: false });
  });
});
