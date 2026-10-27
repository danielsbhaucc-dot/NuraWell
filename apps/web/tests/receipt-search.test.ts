import { describe, expect, it } from 'vitest';
import { charGrams, matchesAnyWord, pgTrigrams, queryGrams, receiptSearchText } from '@/lib/legal/media/receipts-core';

describe('receipt search (blind index)', () => {
  it('builds the same text as the dropped generated column', () => {
    expect(receiptSearchText({ vendor: 'OpenAI', plan: null, subject: 'Your Receipt', currency: 'USD', amount: 20 })).toBe('openai  your receipt usd 20');
  });
  it('query grams are a subset of the grams of any text containing the word', () => {
    const text = 'anthropic pro usd 20';
    for (const w of ['ant', 'thropic', 'o u', 'pro', 'usd 2']) {
      const have = new Set(text.split(' ').flatMap(charGrams));
      expect(matchesAnyWord(text, [w])).toBe(true);
      for (const g of w.split(' ').filter(Boolean).flatMap(queryGrams)) expect(have.has(g)).toBe(true);
    }
  });
  it('emulates pg_trgm show_trgm word padding', () => {
    expect(pgTrigrams('Cat').sort()).toEqual(['  c', ' ca', 'at ', 'cat'].sort());
    expect(pgTrigrams('ab-12')).toEqual(expect.arrayContaining(['  a', ' ab', 'ab ', '  1', ' 12', '12 ']));
  });
});
