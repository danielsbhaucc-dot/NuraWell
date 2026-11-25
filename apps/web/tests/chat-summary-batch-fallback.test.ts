import { AsyncLocalStorage } from 'node:async_hooks';
(globalThis as unknown as { AsyncLocalStorage: unknown }).AsyncLocalStorage ??= AsyncLocalStorage;
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

process.env.OPENROUTER_API_KEY = 'test-key-not-real';
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://db.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'k';
delete process.env.GROQ_API_KEY;

const { _setPiiSeedLoader } = await import('@/lib/ai/privacy/outbound-pii-guard');
_setPiiSeedLoader(() => Promise.resolve(null));

const { generateChatSummaryInsight } = await import('@/lib/ai/chat-memory/chat-summary-llm');

const SYNC_TEXT = 'סיכום סינכרוני לגיבוי';

const urlOf = (input: RequestInfo | URL): string =>
  typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

const mockBatchFetch = (opts: { resultsBody?: string; pollError?: boolean }) =>
  vi.fn(async (input: RequestInfo | URL) => {
    const url = urlOf(input);
    if (url.endsWith('/batches')) {
      return new Response(JSON.stringify({ id: 'b1' }), { headers: { 'content-type': 'application/json' } });
    }
    if (url.includes('/batches/b1/results')) {
      return new Response(opts.resultsBody ?? '{not json\n');
    }
    if (url.includes('/batches/b1')) {
      if (opts.pollError) throw new TypeError('fetch failed');
      return new Response(JSON.stringify({ status: 'completed', results_url: 'https://openrouter.ai/api/v1/batches/b1/results' }), {
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url.includes('/chat/completions')) {
      return new Response(
        JSON.stringify({ model: 'm', choices: [{ message: { content: SYNC_TEXT } }], usage: { cost: 0.001 } }),
        { headers: { 'content-type': 'application/json' } }
      );
    }
    return new Response('', { status: 201 });
  });

const runInsight = () =>
  generateChatSummaryInsight({ type: 'daily', periodKey: '2026-11-25', firstName: 'QA', sourceBlock: 'חומר' });

describe('chat summary batch errors fall back to the synchronous summary', () => {
  beforeEach(() => {
    process.env.CHAT_SUMMARY_USE_BATCH = '1';
    process.env.OPENROUTER_API_KEY = 'test-key-not-real';
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://db.test';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'k';
  });
  afterEach(() => {
    delete process.env.CHAT_SUMMARY_USE_BATCH;
    vi.unstubAllGlobals();
  });

  it('falls back to the sync summary when the batch results file is malformed', async () => {
    vi.stubGlobal('fetch', mockBatchFetch({ resultsBody: '{not json\n' }));
    await expect(runInsight()).resolves.toBe(SYNC_TEXT);
  }, 15_000);

  it('falls back to the sync summary when polling the batch fails with a network error', async () => {
    vi.stubGlobal('fetch', mockBatchFetch({ pollError: true }));
    await expect(runInsight()).resolves.toBe(SYNC_TEXT);
  }, 15_000);
});
