/**
 * מריץ עבודה לא-קריטית אחרי LCP / idle — בלי לחסום את הצביעה הראשונה.
 */
export function runWhenIdle(fn: () => void, timeoutMs = 2500): () => void {
  if (typeof window === 'undefined') return () => {};

  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(() => fn(), { timeout: timeoutMs });
    return () => window.cancelIdleCallback(id);
  }

  const t = window.setTimeout(fn, Math.min(timeoutMs, 1200));
  return () => window.clearTimeout(t);
}
