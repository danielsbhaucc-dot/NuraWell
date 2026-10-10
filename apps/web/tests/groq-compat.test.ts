import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  GROQ_GPT_OSS_REASONING_HEADROOM,
  adaptGroqChatBody,
  groqCompatFetch,
  isGptOssModel,
} from '../lib/ai/groq-compat';

describe('groq gpt-oss compat', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.GROQ_GPT_OSS_REASONING_EFFORT;
  });

  it('detects gpt-oss models only', () => {
    expect(isGptOssModel('openai/gpt-oss-20b')).toBe(true);
    expect(isGptOssModel('openai/gpt-oss-120b')).toBe(true);
    expect(isGptOssModel('meta-llama/llama-4-maverick')).toBe(false);
    expect(isGptOssModel(undefined)).toBe(false);
  });

  it('adds low reasoning effort, hides reasoning and keeps the visible answer budget', () => {
    const out = adaptGroqChatBody({ model: 'openai/gpt-oss-20b', max_tokens: 80, temperature: 0 });
    expect(out.reasoning_effort).toBe('low');
    expect(out.include_reasoning).toBe(false);
    expect(out.max_tokens).toBe(80 + GROQ_GPT_OSS_REASONING_HEADROOM);
    expect(out.temperature).toBe(0);
  });

  it('respects caller overrides and env effort', () => {
    process.env.GROQ_GPT_OSS_REASONING_EFFORT = 'medium';
    expect(adaptGroqChatBody({ model: 'openai/gpt-oss-120b' }).reasoning_effort).toBe('medium');
    expect(
      adaptGroqChatBody({ model: 'openai/gpt-oss-120b', reasoning_effort: 'high' }).reasoning_effort
    ).toBe('high');
  });

  it('leaves non gpt-oss bodies untouched', () => {
    const body = { model: 'llama-x', max_tokens: 50 };
    expect(adaptGroqChatBody(body)).toBe(body);
  });

  it('caps max tokens at the model limit', () => {
    expect(adaptGroqChatBody({ model: 'openai/gpt-oss-120b', max_tokens: 65_400 }).max_tokens).toBe(65_536);
  });

  it('rewrites chat-completions requests through fetch', async () => {
    const spy = vi.fn(async () => new Response('{}'));
    vi.stubGlobal('fetch', spy);
    await groqCompatFetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      body: JSON.stringify({ model: 'openai/gpt-oss-20b', max_tokens: 140 }),
    });
    const sent = JSON.parse((spy.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(sent.reasoning_effort).toBe('low');
    expect(sent.max_tokens).toBe(140 + GROQ_GPT_OSS_REASONING_HEADROOM);
  });

  it('passes other endpoints through unchanged', async () => {
    const spy = vi.fn(async () => new Response('{}'));
    vi.stubGlobal('fetch', spy);
    const init = { method: 'POST', body: JSON.stringify({ model: 'openai/gpt-oss-20b' }) };
    await groqCompatFetch('https://api.groq.com/openai/v1/embeddings', init);
    expect((spy.mock.calls[0] as unknown as [string, RequestInit])[1]).toBe(init);
  });
});
