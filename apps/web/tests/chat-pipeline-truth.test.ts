import { describe, expect, it } from 'vitest';
import { parseLlmJsonObject } from '../lib/ai/parse-llm-json';
import { mergeTranscriptWithClientMessages } from '../lib/ai/chat-sessions/fetch-transcript';
import { chatWriterFallbackSlugs } from '../lib/ai/chat-writer-fleet';
import { applyStickyWriterStance } from '../lib/ai/writer-stance-memory';

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

describe('applyStickyWriterStance', () => {
  const now = new Date('2026-08-15T20:00:00Z');

  it('keeps Grok on a short excuse follow-up', () => {
    const out = applyStickyWriterStance({
      turnWriter: 'terra',
      turnTags: [],
      sticky: {
        writer: 'grok',
        reason: 'confrontation',
        tags: ['evasion'],
        turns: 1,
        updated_at: '2026-08-15T19:55:00Z',
      },
      userMessage: 'כן אבל שוב שכחתי',
      now,
    });
    expect(out.writer).toBe('grok');
    expect(out.stickyApplied).toBe(true);
  });

  it('releases Grok when the user starts a new coaching question', () => {
    const out = applyStickyWriterStance({
      turnWriter: 'terra',
      turnTags: ['coaching'],
      sticky: {
        writer: 'grok',
        reason: 'confrontation',
        tags: ['evasion'],
        turns: 2,
        updated_at: '2026-08-15T19:55:00Z',
      },
      userMessage: 'מה כדאי לי לאכול אחרי אימון?',
      now,
    });
    expect(out.writer).toBe('terra');
    expect(out.stickyApplied).toBe(false);
  });

  it('always lets Claude take a hard boundary even over sticky Grok', () => {
    const out = applyStickyWriterStance({
      turnWriter: 'claude5',
      turnTags: ['safety'],
      sticky: {
        writer: 'grok',
        reason: 'confrontation',
        tags: ['evasion'],
        turns: 1,
        updated_at: '2026-08-15T19:55:00Z',
      },
      userMessage: 'אני רוצה להיעלם',
      now,
    });
    expect(out.writer).toBe('claude5');
  });

  it('releases Grok sticky on a new food/coaching question', () => {
    const out = applyStickyWriterStance({
      turnWriter: 'terra',
      turnTags: ['coaching'],
      sticky: {
        writer: 'grok',
        reason: 'confrontation',
        tags: ['evasion'],
        turns: 1,
        updated_at: '2026-08-15T19:55:00Z',
      },
      userMessage: 'מה אוכלים היום?',
      now,
    });
    expect(out.writer).toBe('terra');
    expect(out.stickyApplied).toBe(false);
  });

  it('does not keep Grok merely because previous turn was grok', () => {
    const out = applyStickyWriterStance({
      turnWriter: 'grok',
      turnTags: [],
      sticky: {
        writer: 'grok',
        reason: 'confrontation',
        tags: ['evasion'],
        turns: 1,
        updated_at: '2026-08-15T19:55:00Z',
      },
      userMessage: 'סבבה מה הולך עם המים',
      now,
    });
    expect(out.writer).toBe('terra');
    expect(out.stickyApplied).toBe(false);
  });
});
