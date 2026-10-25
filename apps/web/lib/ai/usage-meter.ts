import { guardOutboundBody, restoreAiResponse } from '@/lib/ai/privacy/outbound-pii-guard';
/**
 * Measured AI spend. Wraps fetch for OpenRouter chat/embeddings calls:
 *  - asks OpenRouter to include billed cost (`usage: { include: true }`),
 *  - reads `usage.cost` from the JSON or the final SSE chunk (stream is tee'd, caller unaffected),
 *  - writes one row to ai_usage_events (best-effort, never throws, never delays the caller).
 * Attribution: explicit `meta` arg, else the async context set by `withAiUsage()`, else body.user.
 */
import { after } from 'next/server';

/** `feature` is required: every metered AI call must say what it is for (cost breakdown). */
export type AiUsageMeta = { userId?: string | null; feature: string };
type AiUsageStore = { userId?: string | null; feature?: string };

type Als = { getStore(): AiUsageStore | undefined; run<T>(s: AiUsageStore, fn: () => T): T; enterWith?: (s: AiUsageStore) => void };
const AlsCtor = (globalThis as unknown as { AsyncLocalStorage?: new () => Als }).AsyncLocalStorage;
const als: Als | null = AlsCtor ? new AlsCtor() : null;

/** Run `fn` with AI-usage attribution (user + feature) for every metered call inside it. */
export function withAiUsage<T>(meta: AiUsageMeta, fn: () => T): T {
  return als ? als.run({ ...(als.getStore() ?? {}), ...meta }, fn) : fn();
}

/**
 * Per-user AI scope: every AI call inside redacts only this user's identifiers (stable tokens)
 * and is attributed to them. Use around any per-user cron / batch / workflow AI call.
 */
export function withAiUser<T>(userId: string | null | undefined, feature: string, fn: () => T): T {
  return withAiUsage(userId ? { userId, feature } : { feature }, fn);
}

/** Label the rest of the current request (no callback needed; Node only). Used by cron auth. */
export function enterAiUsage(meta: AiUsageMeta) {
  const cur = als?.getStore();
  if (cur) {
    // keep a more specific context, but fill in the user when it was missing
    if (meta.userId && !cur.userId) cur.userId = meta.userId;
    if (!cur.feature) cur.feature = meta.feature;
    return;
  }
  try {
    als?.enterWith?.({ ...meta });
  } catch {
    /* unsupported runtime */
  }
}

/** Attach the user once known (e.g. after auth) to the current attribution context. */
/** userId of the current AI usage scope (ALS), if any */
export function currentAiUserId(): string | null {
  const id = als?.getStore()?.userId;
  return id && UUID.test(id) ? id : null;
}

export function setAiUsageUser(userId: string) {
  const st = als?.getStore();
  if (st) st.userId = userId;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Usage = { cost?: number; prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } };

export function _parseSseUsage(text: string): { usage: Usage | null; model: string | null } {
  let usage: Usage | null = null;
  let model: string | null = null;
  for (const line of text.split('\n')) {
    if (!line.startsWith('data:')) continue;
    const raw = line.slice(5).trim();
    if (!raw || raw === '[DONE]' || !raw.includes('"usage"')) continue;
    try {
      const j = JSON.parse(raw) as { usage?: Usage; model?: string };
      if (j.usage) usage = j.usage;
      if (j.model) model = j.model;
    } catch {
      /* partial line */
    }
  }
  return { usage, model };
}

async function record(row: Record<string, unknown>) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return;
  await fetch(`${url.replace(/\/$/, '')}/rest/v1/ai_usage_events`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'content-type': 'application/json', Prefer: 'return=minimal', 'User-Agent': 'NuraWell-Server/usage-meter/1' },
    body: JSON.stringify(row),
  }).catch(() => {});
}

function schedule(p: Promise<unknown>) {
  const safe = p.catch(() => {});
  try {
    after(safe);
    return;
  } catch {
    /* outside a request scope */
  }
  void safe;
}

/** Runtime fallback: no feature tag reached the meter. Name the caller so it can be fixed. */
export function _callerFromStack(stack: string | undefined): string {
  for (const line of (stack ?? '').split('\n').slice(1)) {
    if (/usage-meter|node_modules|node:internal|openai|@ai-sdk|\(native\)/.test(line)) continue;
    const m = line.match(/(?:app|lib)\/[\w\-./\[\]]+?\.(?:ts|tsx|js)/) ?? line.match(/([\w\-.]+\.(?:ts|tsx|js))/);
    if (m) return m[0].replace(/^.*?((?:app|lib)\/)/, '$1').slice(-50);
  }
  return 'unknown';
}
function untaggedFeature(url: string): string {
  const caller = _callerFromStack(new Error().stack);
  console.warn('[usage-meter] AI call without feature tag', { caller, url });
  return `untagged:${caller}`;
}

export function meteredFetch(baseFetch?: typeof fetch, fixedMeta?: { userId?: string | null; feature: string }): typeof fetch {
  const base: typeof fetch = (i, n) => (baseFetch ?? globalThis.fetch)(i, n);
  return async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const isAi = /(openrouter\.ai\/api\/v1|api\.groq\.com\/openai\/v1|api\.deepseek\.com\/v1)\/(chat\/completions|embeddings)$/.test(url);
    if (!isAi || typeof init?.body !== 'string') return base(input, init);
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(init.body);
    } catch {
      return base(input, init);
    }
    const store = als?.getStore() ?? {};
    const ctx: AiUsageStore = { userId: fixedMeta?.userId ?? store.userId, feature: fixedMeta?.feature ?? store.feature };
    const userId = ctx.userId ?? (typeof body.user === 'string' && UUID.test(body.user) ? body.user : null);
    // Central PII guard: nothing identifying leaves; replies are restored below.
    const shield = await guardOutboundBody(body, userId && UUID.test(userId) ? userId : null);
    try {
      shield.assertNoRawPii(JSON.stringify(body));
    } catch {
      // never prints the value; visible in Vercel logs for auditing
      console.error('[pii-guard] residual identifier in outbound AI payload', { feature: ctx.feature ?? null, url });
    }
    if (!/openrouter\.ai/.test(url)) {
      return restoreAiResponse(await base(input, { ...init, body: JSON.stringify(body) }), shield);
    }
    const feature = ctx.feature ?? (url.endsWith('embeddings') ? 'embeddings' : untaggedFeature(url));
    const reqModel = typeof body.model === 'string' ? body.model : null;
    if (!url.endsWith('embeddings')) body.usage = { include: true };
    const res = restoreAiResponse(await base(input, { ...init, body: JSON.stringify(body) }), shield);
    if (!res.ok || !res.body) return res;

    const save = (u: Usage | null, model: string | null) =>
      u && record({
        user_id: userId && UUID.test(userId) ? userId : null,
        feature: feature.slice(0, 60),
        model: model ?? reqModel,
        prompt_tokens: u.prompt_tokens ?? null,
        completion_tokens: u.completion_tokens ?? null,
        cached_tokens: u.prompt_tokens_details?.cached_tokens ?? null,
        cost_usd: typeof u.cost === 'number' ? u.cost : 0,
      });

    const isStream = (res.headers.get('content-type') ?? '').includes('event-stream');
    if (!isStream) {
      // awaited (bounded): serverless functions can freeze right after the caller returns, dropping a detached insert
      const job = res.clone().json().then((j: { usage?: Usage; model?: string }) => save(j.usage ?? null, j.model ?? null)).catch(() => {});
      await Promise.race([job, new Promise((r) => setTimeout(r, 1500))]);
      return res;
    }
    const [a, b] = res.body.tee();
    schedule(new Response(b).text().then((t) => {
      const { usage, model } = _parseSseUsage(t);
      return save(usage, model);
    }));
    return new Response(a, { status: res.status, statusText: res.statusText, headers: res.headers });
  };
}
