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
_setPiiSeedLoader(async () => null);

const WEB_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = join(WEB_ROOT, '../..');

function expectIgnored(provider: { ignore?: unknown } | null | undefined) {
  expect(provider).toBeTruthy();
  const ignore = provider!.ignore;
  expect(Array.isArray(ignore)).toBe(true);
  for (const slug of OPENROUTER_IGNORED_PROVIDERS) {
    expect(ignore).toContain(slug);
  }
  expect(ignore).toContain(OPENROUTER_GMI_CLOUD_SLUG);
}

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
    expect(out.ignore).toEqual(['together', ...OPENROUTER_IGNORED_PROVIDERS]);
  });

  it('does not duplicate ignore entries already present, and still adds missing variants', () => {
    const out = mergeOpenRouterProviderPrefs({ ignore: ['gmicloud', 'together'] });
    const ignore = out.ignore as string[];
    expect(ignore.filter((x) => x === 'gmicloud').length).toBe(1);
    expect(ignore[0]).toBe('gmicloud');
    expect(ignore).toContain('together');
    expect(ignore).toContain('GMICloud');
    expect(ignore).toContain('GMI Cloud');
    const twice = mergeOpenRouterProviderPrefs(out);
    expect(twice.ignore).toEqual(ignore);
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
    const t =
      'data: {"provider":"Amazon Bedrock","choices":[{"delta":{"content":"hi"}}]}\n\n' +
      'data: {"model":"openai/gpt-5-mini","provider":"Amazon Bedrock","usage":{"prompt_tokens":4,"completion_tokens":2,"cost":0.01}}\n\n' +
      'data: [DONE]\n';
    expect(_parseSseUsage(t)).toEqual({
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
    const base = vi.fn(async (u: string, init: RequestInit) => {
      calls.push({ url: String(u), body: String(init.body ?? '') });
      if (String(u).includes('openrouter')) {
        return new Response(
          JSON.stringify({ model: 'm', provider: 'Google AI Studio', usage: { cost: 0.03, prompt_tokens: 2, completion_tokens: 1 } }),
          { headers: { 'content-type': 'application/json' } }
        );
      }
      return new Response('', { status: 201 });
    });
    vi.stubGlobal('fetch', base);
    const f = meteredFetch(base as never);
    await withAiUsage({ feature: 'stream_test', userId: '11111111-1111-4111-8111-111111111111' }, () =>
      f('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        body: JSON.stringify({ model: 'm', messages: [{ role: 'user', content: 'secret-prompt-text' }] }),
      })
    );
    await new Promise((r) => setTimeout(r, 20));
    const rec = JSON.parse(calls.find((c) => c.url.includes('ai_usage_events'))!.body) as Record<string, unknown>;
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
    const base = vi.fn(async (u: string, init: RequestInit) => {
      calls.push({ url: String(u), body: String(init.body ?? '') });
      if (String(u).includes('openrouter')) {
        return new Response(sse, { headers: { 'content-type': 'text/event-stream' } });
      }
      return new Response('', { status: 201 });
    });
    vi.stubGlobal('fetch', base);
    const f = meteredFetch(base as never);
    const res = await withAiUsage({ feature: 'chat_stream' }, () =>
      f('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        body: JSON.stringify({ model: 'openai/gpt-oss-20b', messages: [], stream: true }),
      })
    );
    await res.text();
    await new Promise((r) => setTimeout(r, 40));
    const rec = calls.find((c) => c.url.includes('ai_usage_events'));
    expect(rec).toBeTruthy();
    expect(JSON.parse(rec!.body)).toMatchObject({
      feature: 'chat_stream',
      provider: 'Groq',
      model: 'openai/gpt-oss-20b',
      cost_usd: 0.004,
    });
    expect(JSON.parse(rec!.body)).not.toHaveProperty('content');
    vi.unstubAllGlobals();
  });

  it('recordBatchUsage stores the provider name only', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://db.test';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'k';
    const calls: { url: string; body: string }[] = [];
    const base = vi.fn(async (u: string, init: RequestInit) => {
      calls.push({ url: String(u), body: String(init.body ?? '') });
      return new Response('', { status: 201 });
    });
    vi.stubGlobal('fetch', base);
    await recordBatchUsage({
      feature: 'chat_periodic_summary',
      model: 'openai/gpt-oss-120b',
      usage: { prompt_tokens: 10, completion_tokens: 5, cost: 0.001 },
      provider: 'Together',
    });
    await new Promise((r) => setTimeout(r, 20));
    const rec = JSON.parse(calls.find((c) => c.url.includes('ai_usage_events'))!.body) as Record<string, unknown>;
    expect(rec).toMatchObject({ feature: 'chat_periodic_summary', provider: 'Together', cost_usd: 0.001 });
    expect(Object.keys(rec).sort()).toEqual(
      ['cached_tokens', 'completion_tokens', 'cost_usd', 'feature', 'model', 'prompt_tokens', 'provider', 'user_id'].sort()
    );
    vi.unstubAllGlobals();
  });
});

const SOURCE_EXTS = new Set(['.ts', '.tsx', '.js', '.mjs']);
const SKIP_DIR = new Set(['node_modules', '.git', '.next', 'dist', 'coverage', 'build', 'out']);

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIR.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, acc);
    else if (SOURCE_EXTS.has(extname(name))) acc.push(full);
  }
  return acc;
}

const WRAPPER_RE =
  /\b(meteredFetch|groqCompatFetch|createAiProvider|createOpenRouterAiProvider|openRouterChatFetch|applyOpenRouterProviderIgnore(?:ToPayload|ToBodyString|ToInit)?|createOpenAiCompatibleProvider)\b/;

const INFERENCE_RE =
  /openrouter\.ai\/api\/v1\/(?:chat\/completions|completions|embeddings|responses|messages|batches)\b|openrouter\.(?:chat|embeddings)\.|\.embeddings\.create\(/;

describe('every OpenRouter inference call site goes through the central builder', () => {
  const files = [
    ...walk(join(REPO_ROOT, 'apps/web')),
    ...walk(join(REPO_ROOT, 'packages/@platform/ai-engine/src')),
    ...walk(join(REPO_ROOT, 'apps/sample-product')),
  ].filter((f) => !f.includes('/tests/') && !f.endsWith('.test.ts') && !f.endsWith('.test.tsx'));

  const sites = files
    .map((file) => ({ file, src: readFileSync(file, 'utf8') }))
    .filter(({ src, file }) => {
      if (!INFERENCE_RE.test(src) && !/openrouter\.ai\/api\/v1/.test(src)) return false;
      // Mention of the API host alone is not a call (CSP, privacy link, cost vendor, base URL helper).
      const hasCall =
        INFERENCE_RE.test(src) ||
        /fetch\(\s*[`'"]https:\/\/(?:eu\.|us\.)?openrouter\.ai/.test(src) ||
        /fetch\(\s*`\$\{[^}]*\}https:\/\/openrouter\.ai/.test(src) ||
        /fetch\(\s*(OPENROUTER_URL|`\$\{base\}\/chat\/completions`)/.test(src);
      if (!hasCall) return false;
      // Skip files that only hit /key or compare endpoint strings, with no inference POST.
      const onlyKeyOrCompare =
        !/chat\/completions|\/embeddings|\/batches(?!\/\$)|\/responses|\/messages|embeddings\.create|chat\.completions/.test(
          src
        );
      if (onlyKeyOrCompare) return false;
      void file;
      return true;
    });

  it('finds the known inference call sites', () => {
    const rels = sites.map(({ file }) => relative(REPO_ROOT, file)).sort();
    expect(rels.length).toBeGreaterThan(8);
    expect(rels.some((r) => r.endsWith('usage-meter.ts') || r.includes('llm-relay') || r.includes('chat-summary-llm'))).toBe(
      true
    );
  });

  it('each call site uses the builder or a wrapper that already goes through it', () => {
    const missing: string[] = [];
    for (const { file, src } of sites) {
      const rel = relative(REPO_ROOT, file);
      if (WRAPPER_RE.test(src)) continue;
      // SDK client (`openrouter` from lib/ai/client) sends every request through groqCompatFetch → meteredFetch.
      if (/\bopenrouter\.(chat|embeddings)\b/.test(src)) continue;
      if (rel.endsWith('lib/ai/client.ts') && /fetch:\s*groqCompatFetch/.test(src)) continue;
      if (rel.endsWith('lib/ai/groq-compat.ts')) continue;
      if (rel.endsWith('lib/ai/usage-meter.ts')) continue;
      if (rel.endsWith('openrouter-request.ts')) continue;
      if (rel.endsWith('backfill-insight-vectors-upstash.mjs')) {
        if (
          src.includes('openrouter-ignored-providers.json') &&
          src.includes('applyOpenRouterProviderIgnore')
        ) {
          continue;
        }
      }
      missing.push(rel);
    }
    expect(missing).toEqual([]);
  });

  it('the local migration exists and says it must not be applied to the live database in this change', () => {
    const sql = readFileSync(join(REPO_ROOT, 'supabase/migrations/000263_ai_usage_events_provider.sql'), 'utf8');
    expect(sql).toMatch(/add column if not exists provider text/i);
    expect(sql.toLowerCase()).toMatch(/do not apply to the live database|not apply to production|local lab only/);
    expect(sql).toMatch(/Name only/);
    expect(sql).not.toMatch(/completion_text|message_content/);
  });
});
