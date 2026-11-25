import { AsyncLocalStorage } from 'node:async_hooks';
(globalThis as unknown as { AsyncLocalStorage: unknown }).AsyncLocalStorage ??= AsyncLocalStorage;
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const afterJobs: Promise<unknown>[] = [];
vi.mock('next/server', () => ({
  after: (job: Promise<unknown>) => {
    afterJobs.push(job);
  },
}));

const { meteredFetch, withAiUsage } = await import('@/lib/ai/usage-meter');
const { _setPiiSeedLoader } = await import('@/lib/ai/privacy/outbound-pii-guard');
_setPiiSeedLoader(() => Promise.resolve(null));

const USER = '11111111-1111-4111-8111-111111111111';
const OR_URL = 'https://openrouter.ai/api/v1/chat/completions';
const INSERT_DELAY_MS = 200;

const delayedInsertFetch = (aiResponse: Response, delayMs: number) => {
  let insertFinished = false;
  const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.includes('openrouter.ai')) return aiResponse.clone();
    if (url.includes('ai_usage_events')) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      insertFinished = true;
      return new Response('', { status: 201 });
    }
    return new Response('', { status: 201 });
  });
  return { fetchImpl, isInsertFinished: () => insertFinished };
};

describe('usage meter waits for the cost insert (persistUsageRow)', () => {
  beforeEach(() => {
    afterJobs.length = 0;
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://db.test';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'k';
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resolves a JSON meteredFetch only after the usage row has been written', async () => {
    const { fetchImpl, isInsertFinished } = delayedInsertFetch(
      new Response(
        JSON.stringify({ model: 'm', provider: 'Groq', usage: { cost: 0.5, prompt_tokens: 1, completion_tokens: 1 } }),
        { headers: { 'content-type': 'application/json' } }
      ),
      INSERT_DELAY_MS
    );
    vi.stubGlobal('fetch', fetchImpl);
    const res = await withAiUsage({ feature: 'await_json', userId: USER }, () =>
      meteredFetch(fetchImpl as never)(OR_URL, { method: 'POST', body: JSON.stringify({ model: 'm', messages: [] }) })
    );
    expect(isInsertFinished()).toBe(true);
    expect((await res.json()).usage.cost).toBe(0.5);
  });

  it('keeps the streaming after() hook pending until the usage row has been written', async () => {
    const sse =
      'data: {"choices":[{"delta":{"content":"hi"}}]}\n\ndata: {"model":"m","usage":{"prompt_tokens":1,"completion_tokens":1,"cost":0.02}}\n\ndata: [DONE]\n';
    const { fetchImpl, isInsertFinished } = delayedInsertFetch(
      new Response(sse, { headers: { 'content-type': 'text/event-stream' } }),
      INSERT_DELAY_MS
    );
    vi.stubGlobal('fetch', fetchImpl);
    const res = await withAiUsage({ feature: 'await_sse', userId: USER }, () =>
      meteredFetch(fetchImpl as never)(OR_URL, { method: 'POST', body: JSON.stringify({ model: 'm', stream: true, messages: [] }) })
    );
    await res.text();
    expect(afterJobs.length).toBeGreaterThan(0);
    await Promise.all(afterJobs);
    expect(isInsertFinished()).toBe(true);
  });
});
