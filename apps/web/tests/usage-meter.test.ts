import { AsyncLocalStorage } from 'node:async_hooks';
(globalThis as unknown as { AsyncLocalStorage: unknown }).AsyncLocalStorage ??= AsyncLocalStorage;
import { describe, expect, it, vi } from 'vitest';
const { _parseSseUsage, meteredFetch, withAiUsage } = await import('@/lib/ai/usage-meter');

describe('usage meter', () => {
  it('parses billed cost from the final SSE chunk', () => {
    const t = 'data: {"choices":[{"delta":{"content":"hi"}}]}\n\ndata: {"model":"openai/gpt-5.4-mini","usage":{"prompt_tokens":10,"completion_tokens":2,"cost":0.00123}}\n\ndata: [DONE]\n';
    expect(_parseSseUsage(t)).toEqual({ usage: { prompt_tokens: 10, completion_tokens: 2, cost: 0.00123 }, model: 'openai/gpt-5.4-mini' });
  });
  it('injects usage.include, records billed cost with feature+user, returns response untouched', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://db.test';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'k';
    const calls: { url: string; body: string }[] = [];
    const base = vi.fn(async (u: string, init: RequestInit) => {
      calls.push({ url: u, body: String(init.body) });
      if (u.includes('openrouter')) return new Response(JSON.stringify({ model: 'm', usage: { cost: 0.5, prompt_tokens: 1, completion_tokens: 1 } }), { headers: { 'content-type': 'application/json' } });
      return new Response('', { status: 201 });
    });
    vi.stubGlobal('fetch', base);
    const f = meteredFetch(base as never);
    const res = await withAiUsage({ feature: 'test_feat', userId: '11111111-1111-4111-8111-111111111111' }, () =>
      f('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', body: JSON.stringify({ model: 'm', messages: [] }) }));
    expect((await res.json()).usage.cost).toBe(0.5);
    await new Promise((r) => setTimeout(r, 20));
    expect(JSON.parse(calls[0].body).usage).toEqual({ include: true });
    const rec = calls.find((c) => c.url.includes('ai_usage_events'));
    expect(rec).toBeTruthy();
    expect(JSON.parse(rec!.body)).toMatchObject({ feature: 'test_feat', cost_usd: 0.5 });
    vi.unstubAllGlobals();
  });
  it('passes non-OpenRouter requests through unchanged', async () => {
    const base = vi.fn(async () => new Response('ok'));
    await meteredFetch(base as never)('https://example.com/x', { method: 'POST', body: '{}' });
    expect(base).toHaveBeenCalledWith('https://example.com/x', { method: 'POST', body: '{}' });
  });
});
