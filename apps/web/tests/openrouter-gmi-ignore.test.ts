import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AsyncLocalStorage } from 'node:async_hooks';
(globalThis as unknown as { AsyncLocalStorage: unknown }).AsyncLocalStorage ??= AsyncLocalStorage;
import { describe, expect, it, vi } from 'vitest';
import {
  OPENROUTER_GMI_CLOUD_SLUG,
  OPENROUTER_IGNORED_PROVIDERS,
  applyOpenRouterProviderIgnore,
  applyOpenRouterProviderIgnoreToBodyString,
  applyOpenRouterProviderIgnoreToPayload,
  mergeOpenRouterProviderPrefs,
  readOpenRouterProvider,
} from '@/lib/ai/openrouter-request';

const { _parseSseUsage, meteredFetch, recordBatchUsage, withAiUsage } = await import('@/lib/ai/usage-meter');
const { _setPiiSeedLoader } = await import('@/lib/ai/privacy/outbound-pii-guard');
_setPiiSeedLoader(() => Promise.resolve(null));

const WEB_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = join(WEB_ROOT, '../..');

const expectIgnored = (provider: { ignore?: unknown } | null | undefined) => {
  expect(provider).toBeTruthy();
  if (!provider || !Array.isArray(provider.ignore)) {
    throw new Error('expected provider.ignore to be an array');
  }
  const ignore = provider.ignore;
  const lower = ignore
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.toLowerCase());
  for (const slug of OPENROUTER_IGNORED_PROVIDERS) {
    expect(lower).toContain(slug.toLowerCase());
  }
  expect(lower).toContain(OPENROUTER_GMI_CLOUD_SLUG);
};

const usageEventBody = (calls: { url: string; body: string }[]): Record<string, unknown> => {
  const match = calls.find((call) => call.url.includes('ai_usage_events'));
  if (!match) {
    throw new Error('ai_usage_events insert was not sent');
  }
  return JSON.parse(match.body) as Record<string, unknown>;
};

describe('OpenRouter central request builder (GMI Cloud ignore)', () => {
  it('keeps the official slug and display-name variants in sync with the JSON list', () => {
    expect(OPENROUTER_GMI_CLOUD_SLUG).toBe('gmicloud');
    const json = JSON.parse(
      readFileSync(
        join(REPO_ROOT, 'packages/@platform/ai-engine/src/openrouter-ignored-providers.json'),
        'utf8'
      )
    ) as string[];
    expect(json).toEqual([...OPENROUTER_IGNORED_PROVIDERS]);
    expect(OPENROUTER_IGNORED_PROVIDERS).toEqual(['gmicloud', 'GMICloud', 'GMI Cloud']);
  });

  it('adds the ignore list when no provider prefs exist', () => {
    const out = applyOpenRouterProviderIgnore({ model: 'openai/gpt-5-mini', messages: [] });
    expectIgnored(out.provider as { ignore?: unknown });
    expect(out.model).toBe('openai/gpt-5-mini');
    expect(out.messages).toEqual([]);
  });

  it('merges ignore without dropping only, order, sort, or allow_fallbacks', () => {
    const out = mergeOpenRouterProviderPrefs({
      only: ['Groq'],
      order: ['groq', 'amazon-bedrock'],
      sort: 'latency',
      allow_fallbacks: true,
      data_collection: 'deny',
      ignore: ['together'],
    });
    expect(out.only).toEqual(['Groq']);
    expect(out.order).toEqual(['groq', 'amazon-bedrock']);
    expect(out.sort).toBe('latency');
    expect(out.allow_fallbacks).toBe(true);
    expect(out.data_collection).toBe('deny');
    const ignore = out.ignore as string[];
    expect(ignore[0]).toBe('together');
    const lower = ignore.map((item) => item.toLowerCase());
    for (const slug of OPENROUTER_IGNORED_PROVIDERS) {
      expect(lower).toContain(slug.toLowerCase());
    }
    expect(ignore.filter((item) => item.toLowerCase() === 'gmicloud').length).toBe(1);
  });

  it('de-duplicates ignore entries case-insensitively and still adds the spaced spelling', () => {
    const out = mergeOpenRouterProviderPrefs({ ignore: ['GMICLOUD', 'together'] });
    const ignore = out.ignore as string[];
    expect(ignore.filter((x) => x.toLowerCase() === 'gmicloud').length).toBe(1);
    expect(ignore[0]).toBe('GMICLOUD');
    expect(ignore).toContain('together');
    expect(ignore).toContain('GMI Cloud');
    expect(ignore).not.toContain('gmicloud');
    expect(ignore).not.toContain('GMICloud');
    const twice = mergeOpenRouterProviderPrefs(out);
    expect(twice.ignore).toEqual(ignore);
  });

  it('when only names GMI Cloud, ignore still blocks it so the call cannot silently reach that provider', () => {
    for (const only of [['gmicloud'], ['GMICloud'], ['GMI Cloud']]) {
      const out = mergeOpenRouterProviderPrefs({ only });
      expect(out.only).toEqual(only);
      const lower = (out.ignore as string[]).map((item) => item.toLowerCase());
      expect(lower).toContain('gmicloud');
      for (const name of only) {
        expect(lower).toContain(name.toLowerCase());
      }
    }
  });

  it('applies ignore to each inner body of a Batch API payload', () => {
    const out = applyOpenRouterProviderIgnoreToPayload({
      requests: [
        { custom_id: 'a', method: 'POST', url: '/v1/chat/completions', body: { model: 'm', provider: { order: ['groq'] } } },
        { custom_id: 'b', method: 'POST', url: '/v1/chat/completions', body: { model: 'n' } },
      ],
    });
    const reqs = out.requests as Array<{ body: { provider: { ignore?: unknown; order?: unknown } } }>;
    expect(reqs[0].body.provider.order).toEqual(['groq']);
    expectIgnored(reqs[0].body.provider);
    expectIgnored(reqs[1].body.provider);
  });

  it('rewrites a JSON body string idempotently', () => {
    const once = applyOpenRouterProviderIgnoreToBodyString(JSON.stringify({ model: 'm' }));
    const twice = applyOpenRouterProviderIgnoreToBodyString(once);
    expect(once).toBe(twice);
    expectIgnored(JSON.parse(once).provider);
  });
});

describe('usage meter records the answering provider (name only)', () => {
  it('parses provider from an earlier SSE chunk and usage from the last', () => {
    const sseText =
      'data: {"provider":"Amazon Bedrock","choices":[{"delta":{"content":"hi"}}]}\n\n' +
      'data: {"model":"openai/gpt-5-mini","provider":"Amazon Bedrock","usage":{"prompt_tokens":4,"completion_tokens":2,"cost":0.01}}\n\n' +
      'data: [DONE]\n';
    expect(_parseSseUsage(sseText)).toEqual({
      usage: { prompt_tokens: 4, completion_tokens: 2, cost: 0.01 },
      model: 'openai/gpt-5-mini',
      provider: 'Amazon Bedrock',
    });
  });

  it('reads a string provider and ignores a non-string value', () => {
    expect(readOpenRouterProvider({ provider: 'Groq' })).toBe('Groq');
    expect(readOpenRouterProvider({ provider: { id: 'groq' } })).toBeNull();
    expect(readOpenRouterProvider({})).toBeNull();
  });

  it('records provider from a non-stream JSON response and never stores prompt text', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://db.test';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'k';
    const calls: { url: string; body: string }[] = [];
    const base = vi.fn((requestUrl: string, init: RequestInit) => {
      calls.push({ url: String(requestUrl), body: String(init.body ?? '') });
      if (String(requestUrl).includes('openrouter')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({ model: 'm', provider: 'Google AI Studio', usage: { cost: 0.03, prompt_tokens: 2, completion_tokens: 1 } }),
            { headers: { 'content-type': 'application/json' } }
          )
        );
      }
      return Promise.resolve(new Response('', { status: 201 }));
    });
    vi.stubGlobal('fetch', base);
    const fetchWithMeter = meteredFetch(base as never);
    await withAiUsage({ feature: 'stream_test', userId: '11111111-1111-4111-8111-111111111111' }, () =>
      fetchWithMeter('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        body: JSON.stringify({ model: 'm', messages: [{ role: 'user', content: 'secret-prompt-text' }] }),
      })
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    const rec = usageEventBody(calls);
    expect(rec.provider).toBe('Google AI Studio');
    expect(rec.feature).toBe('stream_test');
    expect(JSON.stringify(rec)).not.toContain('secret-prompt-text');
    vi.unstubAllGlobals();
  });

  it('records provider from a streaming response', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://db.test';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'k';
    const calls: { url: string; body: string }[] = [];
    const sse =
      'data: {"provider":"Groq","choices":[{"delta":{"content":"ok"}}]}\n\n' +
      'data: {"provider":"Groq","model":"openai/gpt-oss-20b","usage":{"cost":0.004,"prompt_tokens":3,"completion_tokens":1}}\n\n' +
      'data: [DONE]\n';
    const base = vi.fn((requestUrl: string, init: RequestInit) => {
      calls.push({ url: String(requestUrl), body: String(init.body ?? '') });
      if (String(requestUrl).includes('openrouter')) {
        return Promise.resolve(new Response(sse, { headers: { 'content-type': 'text/event-stream' } }));
      }
      return Promise.resolve(new Response('', { status: 201 }));
    });
    vi.stubGlobal('fetch', base);
    const fetchWithMeter = meteredFetch(base as never);
    const res = await withAiUsage({ feature: 'chat_stream' }, () =>
      fetchWithMeter('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        body: JSON.stringify({ model: 'openai/gpt-oss-20b', messages: [], stream: true }),
      })
    );
    await res.text();
    await new Promise((resolve) => setTimeout(resolve, 40));
    const rec = usageEventBody(calls);
    expect(rec).toMatchObject({
      feature: 'chat_stream',
      provider: 'Groq',
      model: 'openai/gpt-oss-20b',
      cost_usd: 0.004,
    });
    expect(rec).not.toHaveProperty('content');
    vi.unstubAllGlobals();
  });

  it('recordBatchUsage stores the provider name only', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://db.test';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'k';
    const calls: { url: string; body: string }[] = [];
    const base = vi.fn((requestUrl: string, init: RequestInit) => {
      calls.push({ url: String(requestUrl), body: String(init.body ?? '') });
      return Promise.resolve(new Response('', { status: 201 }));
    });
    vi.stubGlobal('fetch', base);
    await recordBatchUsage({
      feature: 'chat_periodic_summary',
      model: 'openai/gpt-oss-120b',
      usage: { prompt_tokens: 10, completion_tokens: 5, cost: 0.001 },
      provider: 'Together',
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    const rec = usageEventBody(calls);
    expect(rec).toMatchObject({ feature: 'chat_periodic_summary', provider: 'Together', cost_usd: 0.001 });
    expect(Object.keys(rec).sort()).toEqual(
      ['cached_tokens', 'completion_tokens', 'cost_usd', 'feature', 'model', 'prompt_tokens', 'provider', 'user_id'].sort()
    );
    vi.unstubAllGlobals();
  });

  it('stores provider as null when the JSON response omits it, and does not throw', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://db.test';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'k';
    const calls: { url: string; body: string }[] = [];
    const base = vi.fn((requestUrl: string, init: RequestInit) => {
      calls.push({ url: String(requestUrl), body: String(init.body ?? '') });
      if (String(requestUrl).includes('openrouter')) {
        return Promise.resolve(
          new Response(JSON.stringify({ model: 'm', usage: { cost: 0.02, prompt_tokens: 1, completion_tokens: 1 } }), {
            headers: { 'content-type': 'application/json' },
          })
        );
      }
      return Promise.resolve(new Response('', { status: 201 }));
    });
    vi.stubGlobal('fetch', base);
    const fetchWithMeter = meteredFetch(base as never);
    await withAiUsage({ feature: 'no_provider' }, () =>
      fetchWithMeter('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        body: JSON.stringify({ model: 'm', messages: [] }),
      })
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    const rec = usageEventBody(calls);
    expect(rec.provider).toBeNull();
    expect(rec.cost_usd).toBe(0.02);
    expect(rec.feature).toBe('no_provider');
    vi.unstubAllGlobals();
  });
});


const PGRST204_PROVIDER = {
  code: 'PGRST204',
  message: "Could not find the 'provider' column of 'ai_usage_events' in the schema cache",
};

describe('ai_usage_events insert tolerates a missing provider column', () => {
  const postUsage = async (handler: (requestUrl: string, init: RequestInit, call: number) => Response) => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://db.test';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'k';
    let call = 0;
    const calls: { url: string; body: string }[] = [];
    const base = vi.fn((requestUrl: string, init: RequestInit) => {
      call += 1;
      calls.push({ url: String(requestUrl), body: String(init.body ?? '') });
      return Promise.resolve(handler(String(requestUrl), init, call));
    });
    vi.stubGlobal('fetch', base);
    await recordBatchUsage({
      feature: 'cost_retry',
      model: 'm',
      usage: { prompt_tokens: 2, completion_tokens: 1, cost: 0.01 },
      provider: 'Groq',
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    return { calls, base };
  };

  it('sends provider when the column exists', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { calls } = await postUsage(() => new Response('', { status: 201 }));
    expect(calls).toHaveLength(1);
    expect(JSON.parse(calls[0].body).provider).toBe('Groq');
    expect(JSON.parse(calls[0].body).cost_usd).toBe(0.01);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
    vi.unstubAllGlobals();
  });

  it('retries the cost insert without provider when PostgREST reports a missing column', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { calls } = await postUsage((_u, _i, n) => {
      if (n === 1) {
        return new Response(JSON.stringify(PGRST204_PROVIDER), {
          status: 400,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response('', { status: 201 });
    });
    expect(calls).toHaveLength(2);
    expect(JSON.parse(calls[0].body).provider).toBe('Groq');
    expect(JSON.parse(calls[1].body)).not.toHaveProperty('provider');
    expect(JSON.parse(calls[1].body).cost_usd).toBe(0.01);
    expect(warn).toHaveBeenCalled();
    const logged = warn.mock.calls.map((c) => JSON.stringify(c)).join('\n');
    expect(logged).toMatch(/provider column is missing/);
    expect(logged).not.toMatch(/cost_retry|secret-prompt|Groq/);
    warn.mockRestore();
    vi.unstubAllGlobals();
  });

  it('logs other insert errors and does not retry', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { calls } = await postUsage(
      () =>
        new Response(JSON.stringify({ code: '42501', message: 'permission denied for table ai_usage_events' }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        })
    );
    expect(calls).toHaveLength(1);
    expect(JSON.parse(calls[0].body).provider).toBe('Groq');
    expect(warn).toHaveBeenCalled();
    const logged = warn.mock.calls.map((c) => JSON.stringify(c)).join('\n');
    expect(logged).toMatch(/insert failed/);
    expect(logged).toMatch(/42501/);
    expect(logged).not.toMatch(/permission denied/);
    expect(logged).not.toMatch(/secret-prompt/);
    warn.mockRestore();
    vi.unstubAllGlobals();
  });
});

const SOURCE_EXTS = new Set(['.ts', '.tsx', '.js', '.mjs']);
const SKIP_DIR = new Set(['node_modules', '.git', '.next', 'dist', 'coverage', 'build', 'out']);

const walkSourceFiles = (dir: string, acc: string[] = []): string[] => {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIR.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walkSourceFiles(full, acc);
    else if (SOURCE_EXTS.has(extname(name))) acc.push(full);
  }
  return acc;
};

const WRAPPER_RE =
  /\b(meteredFetch|groqCompatFetch|createAiProvider|createOpenRouterAiProvider|openRouterChatFetch|applyOpenRouterProviderIgnore(?:ToPayload|ToBodyString|ToInit)?|createOpenAiCompatibleProvider)\b/;

const INFERENCE_RE =
  /openrouter\.ai\/api\/v1\/(?:chat\/completions|completions|embeddings|responses|messages|batches)\b|openrouter\.(?:chat|embeddings)\.|\.embeddings\.create\(/;

const mentionsOpenRouterHost = (source: string): boolean =>
  INFERENCE_RE.test(source) || /openrouter\.ai\/api\/v1/.test(source);

const hasFetchToOpenRouter = (source: string): boolean => {
  if (INFERENCE_RE.test(source)) return true;
  if (/fetch\(\s*[`'"]https:\/\/(?:eu\.|us\.)?openrouter\.ai/.test(source)) return true;
  if (/fetch\(\s*`\$\{[^}]*\}https:\/\/openrouter\.ai/.test(source)) return true;
  return /fetch\(\s*(OPENROUTER_URL|`\$\{base\}\/chat\/completions`)/.test(source);
};

// Skip files that only hit /key or compare endpoint strings, with no inference POST.
const hasInferencePath = (source: string): boolean =>
  /chat\/completions|\/embeddings|\/batches(?!\/\$)|\/responses|\/messages|embeddings\.create|chat\.completions/.test(
    source
  );

const hasOpenRouterInferenceCall = (source: string): boolean =>
  mentionsOpenRouterHost(source) && hasFetchToOpenRouter(source) && hasInferencePath(source);

const BUILDER_PATH_SUFFIXES = ['lib/ai/groq-compat.ts', 'lib/ai/usage-meter.ts', 'openrouter-request.ts'];

const clientUsesGroqCompat = (rel: string, source: string): boolean =>
  rel.endsWith('lib/ai/client.ts') && /fetch:\s*groqCompatFetch/.test(source);

const LOCAL_BUILDER_RE = /\b(?:function|const|let|var)\s+applyOpenRouterProviderIgnore\b/;

const backfillUsesSharedBuilder = (rel: string, source: string): boolean =>
  rel.endsWith('backfill-insight-vectors-upstash.mjs') &&
  source.includes('packages/@platform/ai-engine/src/openrouter-request.ts') &&
  source.includes('await import(') &&
  source.includes('applyOpenRouterProviderIgnore') &&
  !LOCAL_BUILDER_RE.test(source);

const siteUsesBuilder = (rel: string, source: string): boolean => {
  if (rel.endsWith('backfill-insight-vectors-upstash.mjs')) return backfillUsesSharedBuilder(rel, source);
  if (WRAPPER_RE.test(source) || /\bopenrouter\.(chat|embeddings)\b/.test(source)) return true;
  if (BUILDER_PATH_SUFFIXES.some((suffix) => rel.endsWith(suffix))) return true;
  if (clientUsesGroqCompat(rel, source)) return true;
  return false;
};

const relativeSitesMissingBuilder = (sites: { file: string; src: string }[]): string[] =>
  sites
    .map(({ file, src }) => ({ rel: relative(REPO_ROOT, file), src }))
    .filter(({ rel, src }) => !siteUsesBuilder(rel, src))
    .map(({ rel }) => rel);

describe('every OpenRouter inference call site goes through the central builder', () => {
  const files = [
    ...walkSourceFiles(join(REPO_ROOT, 'apps/web')),
    ...walkSourceFiles(join(REPO_ROOT, 'packages/@platform/ai-engine/src')),
    ...walkSourceFiles(join(REPO_ROOT, 'apps/sample-product')),
  ].filter((path) => !path.includes('/tests/') && !path.endsWith('.test.ts') && !path.endsWith('.test.tsx'));

  const sites = files
    .map((file) => ({ file, src: readFileSync(file, 'utf8') }))
    .filter(({ src }) => hasOpenRouterInferenceCall(src));

  it('finds the known inference call sites', () => {
    const rels = sites.map(({ file }) => relative(REPO_ROOT, file)).sort();
    expect(rels.length).toBeGreaterThan(8);
    expect(rels.some((r) => r.endsWith('usage-meter.ts') || r.includes('llm-relay') || r.includes('chat-summary-llm'))).toBe(
      true
    );
  });

  it('each call site uses the builder or a wrapper that already goes through it', () => {
    expect(relativeSitesMissingBuilder(sites)).toEqual([]);
  });

  it('the backfill script dynamically imports the shared builder and does not define a local copy', () => {
    const file = sites.map(({ file }) => file).find((path) => path.endsWith('backfill-insight-vectors-upstash.mjs'));
    expect(file, 'backfill script should be an OpenRouter inference call site').toBeTruthy();
    if (!file) return;
    const src = readFileSync(file, 'utf8');
    const rel = relative(REPO_ROOT, file);
    expect(backfillUsesSharedBuilder(rel, src)).toBe(true);
    expect(src).toContain('packages/@platform/ai-engine/src/openrouter-request.ts');
    expect(src).toContain('await import(');
    expect(LOCAL_BUILDER_RE.test(src)).toBe(false);
  });

  it('the local migration exists and says it must not be applied to the live database in this change', () => {
    const sql = readFileSync(join(REPO_ROOT, 'supabase/migrations/000263_ai_usage_events_provider.sql'), 'utf8');
    expect(sql).toMatch(/add column if not exists provider text/i);
    expect(sql).toMatch(/set lock_timeout\s*=\s*'120s'/i);
    expect(sql.toLowerCase()).toMatch(/do not apply to the live database|not apply to production|local lab only/);
    expect(sql).toMatch(/Name only/);
    expect(sql).not.toMatch(/completion_text|message_content/);
  });
});
