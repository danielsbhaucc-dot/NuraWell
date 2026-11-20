import { AsyncLocalStorage } from 'node:async_hooks';
(globalThis as unknown as { AsyncLocalStorage: unknown }).AsyncLocalStorage ??= AsyncLocalStorage;
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/lib/central/ai-controls', async (orig) => {
  const real = await orig() as typeof import('@/lib/central/ai-controls');
  return {
    ...real,
    parentAiAdmit: vi.fn(),
    parentAiFinish: vi.fn(),
  };
});

const { meteredFetch, withAiUsage } = await import('@/lib/ai/usage-meter');
const { parentAiAdmit, parentAiFinish, blockedProviderResponse } = await import('@/lib/central/ai-controls');
const { _setPiiSeedLoader } = await import('@/lib/ai/privacy/outbound-pii-guard');
_setPiiSeedLoader(async () => null);

describe('usage meter honors parent AI controls', () => {
  beforeEach(() => { vi.mocked(parentAiAdmit).mockReset(); vi.mocked(parentAiFinish).mockReset(); });

  it('does not call the provider when the parent kill switch blocks the run', async () => {
    vi.mocked(parentAiAdmit).mockResolvedValue({ status: 'blocked', reason: 'product_kill' });
    const base = vi.fn(async () => new Response('should-not-run'));
    const f = meteredFetch(base as never);
    const res = await withAiUsage({ feature: 'almog_chat' }, () =>
      f('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', body: JSON.stringify({ model: 'm', messages: [{ role: 'user', content: 'hi' }] }) }));
    expect(res.status).toBe(403);
    expect(res.headers.get('x-parent-ai-blocked')).toBe('product_kill');
    expect(base).not.toHaveBeenCalled();
    expect(parentAiFinish).not.toHaveBeenCalled();
  });

  it('admits, calls the provider, and finishes the parent journal on success', async () => {
    vi.mocked(parentAiAdmit).mockResolvedValue({ status: 'run', runId: '11111111-1111-4111-8111-111111111111' });
    vi.mocked(parentAiFinish).mockResolvedValue(undefined);
    const base = vi.fn(async (u: string) => {
      if (String(u).includes('openrouter')) return new Response(JSON.stringify({ model: 'm', usage: { cost: 0.002, prompt_tokens: 8, completion_tokens: 3 } }), { headers: { 'content-type': 'application/json' } });
      return new Response('', { status: 201 });
    });
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://db.test';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'k';
    const f = meteredFetch(base as never);
    const res = await withAiUsage({ feature: 'almog_chat' }, () =>
      f('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', body: JSON.stringify({ model: 'm', messages: [{ role: 'user', content: 'hi' }] }) }));
    expect((await res.json()).usage.cost).toBe(0.002);
    expect(parentAiAdmit).toHaveBeenCalled();
    await new Promise((r) => setTimeout(r, 20));
    expect(parentAiFinish).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111', expect.objectContaining({ ok: true, costUsd: 0.002, tokensIn: 8, tokensOut: 3 }));
    expect(blockedProviderResponse).toBeTypeOf('function');
  });

  it('fails open and still calls the provider when the parent is unreachable', async () => {
    vi.mocked(parentAiAdmit).mockResolvedValue({ status: 'unavailable' });
    const base = vi.fn(async (u: string) => {
      if (String(u).includes('openrouter')) return new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json' } });
      return new Response('', { status: 201 });
    });
    const f = meteredFetch(base as never);
    const res = await withAiUsage({ feature: 'almog_chat' }, () =>
      f('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', body: JSON.stringify({ model: 'm', messages: [] }) }));
    expect(res.ok).toBe(true);
    expect(parentAiFinish).not.toHaveBeenCalled();
  });
});
