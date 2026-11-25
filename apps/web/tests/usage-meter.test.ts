import { AsyncLocalStorage } from 'node:async_hooks';
(globalThis as unknown as { AsyncLocalStorage: unknown }).AsyncLocalStorage ??= AsyncLocalStorage;
import { describe, expect, it, vi } from 'vitest';
const { _parseSseUsage, meteredFetch, withAiUsage } = await import('@/lib/ai/usage-meter');
const { OPENROUTER_IGNORED_PROVIDERS } = await import('@/lib/ai/openrouter-request');
const { _setPiiSeedLoader } = await import('@/lib/ai/privacy/outbound-pii-guard');
_setPiiSeedLoader(() => Promise.resolve(null)); // no DB lookups from the PII guard in this test

const bodyForUrl = (calls: { url: string; body: string }[], needle: string): Record<string, unknown> => {
  const match = calls.find((call) => call.url.includes(needle));
  if (!match) {
    throw new Error(`missing call to ${needle}`);
  }
  return JSON.parse(match.body) as Record<string, unknown>;
};

describe('usage meter', () => {
  it('parses billed cost from the final SSE chunk', () => {
    const sseText = 'data: {"choices":[{"delta":{"content":"hi"}}]}\n\ndata: {"model":"openai/gpt-5.4-mini","usage":{"prompt_tokens":10,"completion_tokens":2,"cost":0.00123}}\n\ndata: [DONE]\n';
    expect(_parseSseUsage(sseText)).toEqual({ usage: { prompt_tokens: 10, completion_tokens: 2, cost: 0.00123 }, model: 'openai/gpt-5.4-mini', provider: null });
  });
  it('injects usage.include, records billed cost with feature+user, returns response untouched', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://db.test';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'k';
    const calls: { url: string; body: string }[] = [];
    const base = vi.fn((requestUrl: string, init: RequestInit) => {
      calls.push({ url: requestUrl, body: String(init.body) });
      if (requestUrl.includes('openrouter')) {
        return Promise.resolve(
          new Response(JSON.stringify({ model: 'm', provider: 'Anthropic', usage: { cost: 0.5, prompt_tokens: 1, completion_tokens: 1 } }), {
            headers: { 'content-type': 'application/json' },
          })
        );
      }
      return Promise.resolve(new Response('', { status: 201 }));
    });
    vi.stubGlobal('fetch', base);
    const fetchWithMeter = meteredFetch(base as never);
    const res = await withAiUsage({ feature: 'test_feat', userId: '11111111-1111-4111-8111-111111111111' }, () =>
      fetchWithMeter('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', body: JSON.stringify({ model: 'm', messages: [] }) }));
    expect((await res.json()).usage.cost).toBe(0.5);
    await new Promise((resolve) => setTimeout(resolve, 20));
    const sent = bodyForUrl(calls, 'openrouter');
    expect(sent.usage).toEqual({ include: true });
    const sentIgnore = (sent.provider as { ignore: string[] }).ignore.map((item) => item.toLowerCase());
    for (const slug of OPENROUTER_IGNORED_PROVIDERS) {
      expect(sentIgnore).toContain(slug.toLowerCase());
    }
    const rec = bodyForUrl(calls, 'ai_usage_events');
    expect(rec).toMatchObject({ feature: 'test_feat', cost_usd: 0.5, provider: 'Anthropic' });
    expect(rec).not.toHaveProperty('prompt');
    expect(rec).not.toHaveProperty('messages');
    expect(rec).not.toHaveProperty('content');
    vi.unstubAllGlobals();
  });
  it('passes non-OpenRouter requests through unchanged', async () => {
    const base = vi.fn(() => Promise.resolve(new Response('ok')));
    await meteredFetch(base as never)('https://example.com/x', { method: 'POST', body: '{}' });
    expect(base).toHaveBeenCalledWith('https://example.com/x', { method: 'POST', body: '{}' });
  });
});
