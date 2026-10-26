/** Per-request timeout for any fetch (moved from apps/web/lib/ai/provider-factory.ts; identical behaviour). */
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
