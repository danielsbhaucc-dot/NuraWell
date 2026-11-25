import { guardOutboundBody, restoreAiResponse } from '@/lib/ai/privacy/outbound-pii-guard';
import {
  applyOpenRouterProviderIgnoreToInit,
  applyOpenRouterProviderIgnoreToPayload,
  readOpenRouterProvider,
} from '@/lib/ai/openrouter-request';
import { blockedProviderResponse, estimateCallUsd, parentAiAdmit, parentAiFinish } from '@/lib/central/ai-controls';
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

type SseChunk = { usage?: Usage; model?: string; provider?: unknown };

const sseRaw = (line: string): string | null => {
  if (!line.startsWith('data:')) return null;
  const raw = line.slice(5).trim();
  if (raw === '' || raw === '[DONE]') return null;
  return raw;
};

const sseLineHasMeta = (raw: string): boolean =>
  raw.includes('"usage"') || raw.includes('"provider"') || raw.includes('"model"');

const parseSseJson = (raw: string): SseChunk | null => {
  try {
    return JSON.parse(raw) as SseChunk;
  } catch {
    /* partial line */
    return null;
  }
};

const parseSseDataLine = (line: string): SseChunk | null => {
  const raw = sseRaw(line);
  if (!raw) return null;
  if (!sseLineHasMeta(raw)) return null;
  return parseSseJson(raw);
};

type ParsedSse = { usage: Usage | null; model: string | null; provider: string | null };

const applySseChunk = (state: ParsedSse, parsed: SseChunk): void => {
  if (parsed.usage) state.usage = parsed.usage;
  if (parsed.model) state.model = parsed.model;
  const parsedProvider = readOpenRouterProvider(parsed);
  if (parsedProvider) state.provider = parsedProvider;
};

export const _parseSseUsage = (text: string): ParsedSse => {
  const state: ParsedSse = { usage: null, model: null, provider: null };
  for (const line of text.split('\n')) {
    const parsed = parseSseDataLine(line);
    if (parsed) applySseChunk(state, parsed);
  }
  return state;
};

const codeFromJson = (body: string): string | null => {
  try {
    const parsed = JSON.parse(body) as { code?: unknown };
    if (typeof parsed.code !== 'string') return null;
    const code = parsed.code.trim();
    return code ? code.slice(0, 40) : null;
  } catch {
    return null;
  }
};

const postgrestErrorCode = (body: string): string | null => {
  const fromJson = codeFromJson(body);
  if (fromJson) return fromJson;
  const codeMatch = body.match(/\bPGRST\d{3}\b/);
  return codeMatch ? codeMatch[0] : null;
};

const isPgrst204Provider = (body: string): boolean =>
  postgrestErrorCode(body) === 'PGRST204' && /provider/i.test(body);

/** PostgREST PGRST204 when ai_usage_events.provider has not been added yet. */
const isMissingProviderColumn = (status: number, body: string): boolean => {
  if (status !== 400 && status !== 404) return false;
  return isPgrst204Provider(body) || /could not find the ['"]provider['"] column/i.test(body);
};

const warnInsertFailure = (label: string, status: number, body: string) => {
  console.warn(label, { status, code: postgrestErrorCode(body) });
};

const usageEventsPoster = (): ((payload: Record<string, unknown>) => Promise<Response>) | null => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  const endpoint = `${url.replace(/\/$/, '')}/rest/v1/ai_usage_events`;
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'content-type': 'application/json',
    Prefer: 'return=minimal',
    'User-Agent': 'NuraWell-Server/usage-meter/1',
  };
  return (payload: Record<string, unknown>) =>
    fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(payload) });
};

const shouldRetryMissingProvider = (status: number, text: string, row: Record<string, unknown>): boolean =>
  isMissingProviderColumn(status, text) && Object.prototype.hasOwnProperty.call(row, 'provider');

const retryWithoutProviderColumn = async (
  post: (payload: Record<string, unknown>) => Promise<Response>,
  row: Record<string, unknown>
): Promise<void> => {
  const rest = { ...row };
  delete rest.provider;
  console.warn('[usage-meter] ai_usage_events.provider column is missing; retrying the cost insert without it');
  const retry = await post(rest);
  if (retry.ok) return;
  const retryText = await retry.text().catch(() => '');
  warnInsertFailure('[usage-meter] ai_usage_events insert retry failed', retry.status, retryText);
};

const writeUsageEvent = async (
  post: (payload: Record<string, unknown>) => Promise<Response>,
  row: Record<string, unknown>
): Promise<void> => {
  const res = await post(row);
  if (res.ok) return;
  const text = await res.text().catch(() => '');
  if (shouldRetryMissingProvider(res.status, text, row)) {
    await retryWithoutProviderColumn(post, row);
    return;
  }
  warnInsertFailure('[usage-meter] ai_usage_events insert failed', res.status, text);
};

const record = async (row: Record<string, unknown>): Promise<void> => {
  const post = usageEventsPoster();
  if (!post) return;
  try {
    await writeUsageEvent(post, row);
  } catch {
    console.warn('[usage-meter] ai_usage_events insert failed', { error: 'network' });
  }
};

const scopedUserId = (userId: string | null | undefined): string | null =>
  userId && UUID.test(userId) ? userId : null;

const orNull = (value: number | undefined): number | null => (value === undefined ? null : value);

const costUsdOf = (usage: Usage | null | undefined): number =>
  typeof usage?.cost === 'number' ? usage.cost : 0;

const usageEventRow = (params: {
  userId: string | null;
  feature: string;
  model: string | null;
  provider: string | null;
  usage: Usage;
}): Record<string, unknown> => ({
  user_id: scopedUserId(params.userId),
  feature: params.feature.slice(0, 60),
  model: params.model,
  provider: params.provider,
  prompt_tokens: orNull(params.usage.prompt_tokens),
  completion_tokens: orNull(params.usage.completion_tokens),
  cached_tokens: orNull(params.usage.prompt_tokens_details?.cached_tokens),
  cost_usd: costUsdOf(params.usage),
});

/**
 * For calls that bypass meteredFetch (OpenRouter Batch API): record the usage a batch result carries,
 * so batch jobs (periodic chat summaries) show up in ai_usage_events instead of looking like they never ran.
 */
export const recordBatchUsage = async (params: {
  feature: string;
  model: string | null;
  usage: { prompt_tokens?: number; completion_tokens?: number; cost?: number; prompt_tokens_details?: { cached_tokens?: number } } | null | undefined;
  /** OpenRouter serving provider name only; never prompt, completion, or personal data. */
  provider?: string | null;
}): Promise<void> => {
  const usage = params.usage;
  if (!usage) return;
  await record(usageEventRow({
    userId: currentAiUserId(),
    feature: params.feature,
    model: params.model,
    provider: params.provider ?? null,
    usage,
  }));
};

const ignoreFloatingPromise = (job: Promise<unknown>): undefined => {
  job.catch(() => undefined);
  return undefined;
};

const schedule = (p: Promise<unknown>) => {
  const safe = p.catch(() => undefined);
  try {
    after(safe);
    return;
  } catch {
    /* outside a request scope */
  }
  ignoreFloatingPromise(safe);
};

const callerFromLine = (line: string): string | null => {
  if (/usage-meter|node_modules|node:internal|openai|@ai-sdk|\(native\)/.test(line)) return null;
  const fromPath = line.match(/(?:app|lib)\/[\w./[\]-]+?\.(?:ts|tsx|js)/);
  if (fromPath) return fromPath[0].replace(/^.*?((?:app|lib)\/)/, '$1').slice(-50);
  const fromName = line.match(/([\w.-]+\.(?:ts|tsx|js))/);
  if (fromName) return fromName[0].replace(/^.*?((?:app|lib)\/)/, '$1').slice(-50);
  return null;
};

/** Runtime fallback: no feature tag reached the meter. Name the caller so it can be fixed. */
export const _callerFromStack = (stack: string | undefined): string => {
  for (const line of (stack ?? '').split('\n').slice(1)) {
    const caller = callerFromLine(line);
    if (caller) return caller;
  }
  return 'unknown';
};

const untaggedFeature = (url: string): string => {
  const caller = _callerFromStack(new Error().stack);
  console.warn('[usage-meter] AI call without feature tag', { caller, url });
  return `untagged:${caller}`;
};

type UsageSave = (usage: Usage | null, model: string | null, provider: string | null) => unknown;

const finishParentOk = (runId: string, started: number, usage: Usage | null) => {
  ignoreFloatingPromise(parentAiFinish(runId, {
    ok: true,
    costUsd: costUsdOf(usage),
    tokensIn: usage?.prompt_tokens ?? 0,
    tokensOut: usage?.completion_tokens ?? 0,
    ms: Date.now() - started,
  }));
};

const persistUsageRow = (params: {
  runId: string | null;
  started: number;
  userId: string | null;
  feature: string;
  reqModel: string | null;
}): UsageSave => {
  const { runId, started, userId, feature, reqModel } = params;
  return (usage, model, provider) => {
    if (runId) finishParentOk(runId, started, usage);
    if (!usage) return;
    return record(usageEventRow({ userId, feature, model: model ?? reqModel, provider, usage }));
  };
};

const recordJsonResponseUsage = async (res: Response, save: UsageSave): Promise<void> => {
  const job = res
    .clone()
    .json()
    .then((payload: SseChunk) => save(payload.usage ?? null, payload.model ?? null, readOpenRouterProvider(payload)))
    .catch(() => undefined);
  // awaited (bounded): serverless functions can freeze right after the caller returns, dropping a detached insert
  await Promise.race([job, new Promise((resolve) => setTimeout(resolve, 1500))]);
};

const attachSseUsageLogger = (res: Response, save: UsageSave): Response => {
  if (!res.body) return res;
  const [primary, secondary] = res.body.tee();
  schedule(
    new Response(secondary).text().then((text) => {
      const parsed = _parseSseUsage(text);
      return save(parsed.usage, parsed.model, parsed.provider);
    })
  );
  return new Response(primary, { status: res.status, statusText: res.statusText, headers: res.headers });
};

const requestUrlOf = (input: Parameters<typeof fetch>[0]): string =>
  typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

const withIgnoreIfOpenRouter = (url: string, init?: RequestInit): RequestInit | undefined => {
  if (!/openrouter\.ai/.test(url)) return init;
  if (typeof init?.body !== 'string') return init;
  return applyOpenRouterProviderIgnoreToInit(url, init) ?? init;
};

const isMeteredAiUrl = (url: string): boolean =>
  /(openrouter\.ai\/api\/v1|api\.groq\.com\/openai\/v1|api\.deepseek\.com\/v1)\/(chat\/completions|embeddings)$/.test(url);

const parseJsonBody = (raw: string): Record<string, unknown> | null => {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
};

const userIdFromBody = (body: Record<string, unknown>): string | null =>
  typeof body.user === 'string' && UUID.test(body.user) ? body.user : null;

const firstPresent = <T,>(a: T | null | undefined, b: T | null | undefined): T | undefined => {
  if (a) return a;
  if (b) return b;
  return undefined;
};

const usageContextOf = (
  fixedMeta: { userId?: string | null; feature: string } | undefined,
  body: Record<string, unknown>
): { ctx: AiUsageStore; userId: string | null } => {
  const store = als?.getStore();
  const ctx: AiUsageStore = {
    userId: firstPresent(fixedMeta?.userId, store?.userId),
    feature: firstPresent(fixedMeta?.feature, store?.feature),
  };
  return { ctx, userId: scopedUserId(ctx.userId) ?? userIdFromBody(body) };
};

const assertShieldedBody = (shield: { assertNoRawPii: (raw: string) => void }, body: Record<string, unknown>, feature: string | undefined, url: string) => {
  try {
    shield.assertNoRawPii(JSON.stringify(body));
  } catch {
    // never prints the value; visible in Vercel logs for auditing
    console.error('[pii-guard] residual identifier in outbound AI payload', { feature: feature ?? null, url });
  }
};

const featureForCall = (ctx: AiUsageStore, url: string): string => {
  if (ctx.feature) return ctx.feature;
  if (url.endsWith('embeddings')) return 'embeddings';
  return untaggedFeature(url);
};

const prepareOpenRouterBody = (body: Record<string, unknown>, url: string): { body: Record<string, unknown>; reqModel: string | null } => {
  const reqModel = typeof body.model === 'string' ? body.model : null;
  const next = { ...body };
  if (!url.endsWith('embeddings')) next.usage = { include: true };
  return { body: applyOpenRouterProviderIgnoreToPayload(next), reqModel };
};

type Admission = { blocked: Response } | { runId: string | null; started: number };

const admitOrBlock = async (feature: string, body: Record<string, unknown>): Promise<Admission> => {
  const estimate = estimateCallUsd(body);
  const started = Date.now();
  const admitted = await parentAiAdmit({ feature, model: estimate.model, estUsd: estimate.estUsd, maxTokens: estimate.maxTokens });
  if (admitted.status === 'blocked' || admitted.status === 'approval_required') {
    return { blocked: blockedProviderResponse(admitted.reason) };
  }
  return { runId: admitted.status === 'run' ? admitted.runId : null, started };
};

const recordResponseUsage = async (res: Response, save: UsageSave): Promise<Response> => {
  const contentType = res.headers.get('content-type') ?? '';
  if (contentType.includes('event-stream')) return attachSseUsageLogger(res, save);
  await recordJsonResponseUsage(res, save);
  return res;
};

const finishFailedRun = (runId: string | null, started: number, status: number) => {
  if (!runId) return;
  ignoreFloatingPromise(parentAiFinish(runId, { ok: false, costUsd: 0, tokensIn: 0, tokensOut: 0, ms: Date.now() - started, error: `provider_${status}` }));
};

const meterOpenRouterCall = async (params: {
  base: typeof fetch;
  input: Parameters<typeof fetch>[0];
  nextInit: RequestInit;
  body: Record<string, unknown>;
  shield: Awaited<ReturnType<typeof guardOutboundBody>>;
  url: string;
  ctx: AiUsageStore;
  userId: string | null;
}): Promise<Response> => {
  const { base, input, nextInit, shield, url, ctx, userId } = params;
  const prepared = prepareOpenRouterBody(params.body, url);
  const feature = featureForCall(ctx, url);
  const admission = await admitOrBlock(feature, prepared.body);
  if ('blocked' in admission) return admission.blocked;
  const res = restoreAiResponse(await base(input, { ...nextInit, body: JSON.stringify(prepared.body) }), shield);
  if (!res.ok || !res.body) {
    finishFailedRun(admission.runId, admission.started, res.status);
    return res;
  }
  return recordResponseUsage(res, persistUsageRow({
    runId: admission.runId,
    started: admission.started,
    userId,
    feature,
    reqModel: prepared.reqModel,
  }));
};

const dispatchMeteredBody = async (
  base: typeof fetch,
  fixedMeta: { userId?: string | null; feature: string } | undefined,
  input: Parameters<typeof fetch>[0],
  nextInit: RequestInit,
  body: Record<string, unknown>,
  url: string
): Promise<Response> => {
  const { ctx, userId } = usageContextOf(fixedMeta, body);
  const shield = await guardOutboundBody(body, scopedUserId(userId));
  assertShieldedBody(shield, body, ctx.feature, url);
  if (!/openrouter\.ai/.test(url)) {
    return restoreAiResponse(await base(input, { ...nextInit, body: JSON.stringify(body) }), shield);
  }
  return meterOpenRouterCall({ base, input, nextInit, body, shield, url, ctx, userId });
};

const runMeteredFetch = async (
  base: typeof fetch,
  fixedMeta: { userId?: string | null; feature: string } | undefined,
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1]
): Promise<Response> => {
  const url = requestUrlOf(input);
  const nextInit = withIgnoreIfOpenRouter(url, init);
  if (!isMeteredAiUrl(url) || typeof nextInit?.body !== 'string') return base(input, nextInit);
  const body = parseJsonBody(nextInit.body);
  if (!body) return base(input, nextInit);
  return dispatchMeteredBody(base, fixedMeta, input, nextInit, body, url);
};

export const meteredFetch = (baseFetch?: typeof fetch, fixedMeta?: { userId?: string | null; feature: string }): typeof fetch => {
  const base: typeof fetch = (input, nextInit) => (baseFetch ?? globalThis.fetch)(input, nextInit);
  return (input, init) => runMeteredFetch(base, fixedMeta, input, init);
};
