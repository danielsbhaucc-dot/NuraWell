/**
 * Central OpenRouter request builder.
 *
 * Every inference request to OpenRouter (chat, completions, streaming, embeddings,
 * batch, relay) must go through this module so provider preferences are merged in
 * one place and never dropped.
 *
 * GMI Cloud is always added to provider.ignore. The official slug from
 * GET /api/v1/providers is "gmicloud" (display name "GMICloud"). The spaced
 * spelling is included as a safety variant.
 */
/** Official OpenRouter slug for GMI Cloud (providers API, 2026-11-25). */
export const OPENROUTER_GMI_CLOUD_SLUG = 'gmicloud';

/**
 * Variants to add to provider.ignore. Official slug is "gmicloud";
 * "GMICloud" is the providers API display name; "GMI Cloud" is the spaced spelling.
 * Merge is case-insensitive, so "gmicloud" and "GMICloud" are the same entry.
 * Keep this list in sync with openrouter-ignored-providers.json.
 */
export const OPENROUTER_IGNORED_PROVIDERS: readonly string[] = Object.freeze([
  'gmicloud',
  'GMICloud',
  'GMI Cloud',
]);

export function isOpenRouterApiUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return (
      (u.hostname === 'openrouter.ai' ||
        u.hostname === 'eu.openrouter.ai' ||
        u.hostname === 'us.openrouter.ai') &&
      u.pathname.startsWith('/api/')
    );
  } catch {
    return /https?:\/\/(eu\.|us\.)?openrouter\.ai\/api\//.test(url);
  }
}

/** Chat, completions, embeddings, responses, messages, or the Batch API. */
export function isOpenRouterInferenceUrl(url: string): boolean {
  return (
    isOpenRouterApiUrl(url) &&
    /\/(chat\/completions|completions|embeddings|responses|messages|batches)(\/|\?|$)/.test(
      url
    )
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : null;
}

function alreadyIgnored(ignore: string[], slug: string): boolean {
  const key = slug.toLowerCase();
  return ignore.some((item) => item.toLowerCase() === key);
}

/**
 * Merge caller provider prefs with the required ignore list.
 * Existing fields (only, order, sort, allow_fallbacks, data_collection, …) are kept.
 * Existing ignore entries are kept and de-duplicated case-insensitively
 * (so "gmicloud" and "GMICloud" count as one entry).
 *
 * If provider.only already names GMI Cloud (any spelling), ignore still includes
 * it. OpenRouter then has no eligible provider and returns an error, instead of
 * routing the request to GMI Cloud. That error is the safe outcome; the ignore
 * list is never dropped to make the request succeed.
 */
export function mergeOpenRouterProviderPrefs(existing: unknown): Record<string, unknown> {
  const base = asRecord(existing) ?? {};
  const prev = Array.isArray(base.ignore)
    ? base.ignore.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
  const ignore = [...prev];
  for (const slug of OPENROUTER_IGNORED_PROVIDERS) {
    if (!alreadyIgnored(ignore, slug)) ignore.push(slug);
  }
  return { ...base, ignore };
}

export function applyOpenRouterProviderIgnore(
  body: Record<string, unknown>
): Record<string, unknown> {
  return { ...body, provider: mergeOpenRouterProviderPrefs(body.provider) };
}

/**
 * Apply the ignore list to a chat/embeddings body, or to each inner request.body
 * of an OpenRouter Batch API payload.
 */
export function applyOpenRouterProviderIgnoreToPayload(
  payload: Record<string, unknown>
): Record<string, unknown> {
  if (Array.isArray(payload.requests)) {
    return {
      ...payload,
      requests: payload.requests.map((req) => {
        const rec = asRecord(req);
        if (!rec) return req;
        const inner = asRecord(rec.body);
        return inner ? { ...rec, body: applyOpenRouterProviderIgnore(inner) } : rec;
      }),
    };
  }
  return applyOpenRouterProviderIgnore(payload);
}

export function applyOpenRouterProviderIgnoreToBodyString(body: string): string {
  try {
    const parsed: unknown = JSON.parse(body);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return body;
    return JSON.stringify(applyOpenRouterProviderIgnoreToPayload(parsed as Record<string, unknown>));
  } catch {
    return body;
  }
}

export function applyOpenRouterProviderIgnoreToInit(
  url: string,
  init?: RequestInit
): RequestInit | undefined {
  if (!init || typeof init.body !== 'string') return init;
  if (!isOpenRouterApiUrl(url)) return init;
  // Key lookup and generation polling are not inference requests.
  if (/\/api\/v1\/key(\/|$|\?)/.test(url) || /\/api\/v1\/generation/.test(url)) return init;
  const next = applyOpenRouterProviderIgnoreToBodyString(init.body);
  return next === init.body ? init : { ...init, body: next };
}

/** Read the serving provider name from an OpenRouter JSON object. Name only. */
export function readOpenRouterProvider(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const value = (payload as { provider?: unknown }).provider;
  if (typeof value !== 'string') return null;
  const name = value.trim();
  return name ? name.slice(0, 80) : null;
}
