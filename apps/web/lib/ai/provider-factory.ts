import { meteredFetch } from '@/lib/ai/usage-meter';
import { createOpenAI } from '@ai-sdk/openai';
import { publicAppUrlForAiReferer } from '../public-app-url';

/**
 * Single factory for every AI SDK provider (OpenRouter / Groq lane).
 * Centralizes base URL, attribution headers, custom fetch (groq-compat / provider routing)
 * and a per-request timeout (AbortSignal) so background calls can't hang a function.
 *
 * `timeoutMs: null` = no timeout (user-facing streaming chat: reply length is never capped).
 */
export const DEFAULT_BACKGROUND_AI_TIMEOUT_MS = 60_000;

export function withTimeoutFetch(baseFetch: typeof fetch, timeoutMs: number | null): typeof fetch {
  if (!timeoutMs) return baseFetch;
  return async (input, init) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(new Error(`AI request timeout after ${timeoutMs}ms`)), timeoutMs);
    const outer = init?.signal;
    const onAbort = () => ctrl.abort(outer?.reason);
    if (outer) {
      if (outer.aborted) ctrl.abort(outer.reason);
      else outer.addEventListener('abort', onAbort, { once: true });
    }
    try {
      return await baseFetch(input, { ...init, signal: ctrl.signal });
    } finally {
      clearTimeout(timer);
      outer?.removeEventListener('abort', onAbort);
    }
  };
}

export function createAiProvider(opts: {
  apiKey?: string;
  baseURL?: string;
  title?: string;
  fetch?: typeof fetch;
  timeoutMs?: number | null;
  /** false = no OpenRouter attribution headers (e.g. direct Groq) */
  attribution?: boolean;
} = {}) {
  const timeoutMs = opts.timeoutMs === undefined ? DEFAULT_BACKGROUND_AI_TIMEOUT_MS : opts.timeoutMs;
  return createOpenAI({
    apiKey: opts.apiKey ?? (process.env.OPENROUTER_API_KEY?.trim() || 'build-placeholder-key'),
    baseURL: opts.baseURL ?? 'https://openrouter.ai/api/v1',
    ...(opts.attribution === false
      ? {}
      : { headers: { 'HTTP-Referer': publicAppUrlForAiReferer(), 'X-Title': opts.title ?? 'NuraWell' } }),
    // default goes through meteredFetch: usage metering + the central outbound PII guard
    fetch: withTimeoutFetch(opts.fetch ?? meteredFetch(), timeoutMs),
  });
}
