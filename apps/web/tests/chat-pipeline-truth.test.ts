import { describe, expect, it } from 'vitest';
import { parseLlmJsonObject } from '../lib/ai/parse-llm-json';
import { mergeTranscriptWithClientMessages } from '../lib/ai/chat-sessions/fetch-transcript';
import { chatWriterFallbackSlugs } from '../lib/ai/chat-writer-fleet';

describe('parseLlmJsonObject', () => {
  it('parses fenced JSON from a chat router', () => {
    const raw = 'הנה\n```json\n{"writer":"grok","heavy_context":true}\n```';
    expect(parseLlmJsonObject(raw)).toEqual({ writer: 'grok', heavy_context: true });
  });
});

describe('mergeTranscriptWithClientMessages', () => {
  it('prefers the longer DB transcript when the client sent one turn', () => {
    const merged = mergeTranscriptWithClientMessages({
      dbTurns: [
        { role: 'user', content: 'אני אבא לשניים', created_at: '1' },
        { role: 'assistant', content: 'וואלה, איזה גילאים?', created_at: '2' },
        { role: 'user', content: 'ומה עם המים', created_at: '3' },
      ],
      clientTurns: [{ role: 'user', content: 'ומה עם המים' }],
      lastUserText: 'ומה עם המים',
      windowSize: 10,
    });
    expect(merged).toHaveLength(3);
    expect(merged[0]?.content).toContain('אבא לשניים');
  });
});

describe('chatWriterFallbackSlugs', () => {
  it('never falls back to Llama', () => {
    const fallbacks = chatWriterFallbackSlugs('openai/gpt-5.6-terra');
    expect(fallbacks.some((s) => /llama/i.test(s))).toBe(false);
    expect(fallbacks.length).toBeGreaterThan(0);
  });
});
