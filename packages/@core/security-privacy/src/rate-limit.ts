/** Token-bucket rate limiter with pluggable store (Workers: Durable Object / KV; tests: memory). Fails CLOSED on store error. */
export interface Store { get(k: string): Promise<{ tokens: number; at: number } | null>; set(k: string, v: { tokens: number; at: number }): Promise<void> }
export const memoryStore = (): Store => { const m = new Map<string, { tokens: number; at: number }>(); return { async get(k) { return m.get(k) ?? null; }, async set(k, v) { m.set(k, v); } }; };
export function rateLimiter(o: { store: Store; capacity: number; refillPerSec: number; now?: () => number }) {
  return async (key: string): Promise<{ ok: boolean; retryAfterSec: number }> => {
    try {
      const now = (o.now ?? Date.now)(); const cur = (await o.store.get(key)) ?? { tokens: o.capacity, at: now };
      const tokens = Math.min(o.capacity, cur.tokens + ((now - cur.at) / 1000) * o.refillPerSec);
      if (tokens < 1) { await o.store.set(key, { tokens, at: now }); return { ok: false, retryAfterSec: Math.ceil((1 - tokens) / o.refillPerSec) }; }
      await o.store.set(key, { tokens: tokens - 1, at: now }); return { ok: true, retryAfterSec: 0 };
    } catch { return { ok: false, retryAfterSec: 60 }; }
  };
}

/* ── Fixed-window limiter (used by Next.js products, e.g. NuraWell). Same semantics as the product's original code. ── */
export type FixedWindowInput = { key: string; limit: number; windowSeconds: number; namespace: string };
export type FixedWindowResult = { ok: boolean; limit: number; remaining: number; resetAt: number };

const memoryWindows = new Map<string, { count: number; resetAt: number }>();
let lastMemoryCleanupAt = 0;

/** Per-instance fallback window (not distributed). Stops runaway client loops when no shared store is reachable. */
export function fixedWindowMemory(input: FixedWindowInput, now: number): FixedWindowResult {
  if (now - lastMemoryCleanupAt >= 60_000) {
    lastMemoryCleanupAt = now;
    for (const [k, e] of memoryWindows.entries()) if (e.resetAt <= now) memoryWindows.delete(k);
  }
  const mapKey = `${input.namespace}:${input.key}`;
  const existing = memoryWindows.get(mapKey);
  if (!existing || existing.resetAt <= now) {
    const fresh = { count: 1, resetAt: now + input.windowSeconds * 1000 };
    memoryWindows.set(mapKey, fresh);
    return { ok: true, limit: input.limit, remaining: input.limit - 1, resetAt: fresh.resetAt };
  }
  existing.count += 1;
  return { ok: existing.count <= input.limit, limit: input.limit, remaining: Math.max(0, input.limit - existing.count), resetAt: existing.resetAt };
}

/** Distributed window via Upstash Redis REST (INCR+EXPIRE pipeline). Returns null on any failure so the caller can fall back. */
export async function fixedWindowUpstash(cfg: { url: string; token: string }, input: FixedWindowInput, now: number, f: typeof fetch = fetch): Promise<FixedWindowResult | null> {
  const bucket = Math.floor(now / 1000 / input.windowSeconds);
  const redisKey = `rl:${input.namespace}:${input.key}:${bucket}`;
  const resetAt = (bucket + 1) * input.windowSeconds * 1000;
  let count = 0;
  try {
    const res = await f(`${cfg.url.replace(/\/+$/, '')}/pipeline`, {
      method: 'POST', headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([['INCR', redisKey], ['EXPIRE', redisKey, String(input.windowSeconds + 5)]]),
    });
    if (!res.ok) throw new Error(`upstash redis ${res.status}`);
    const first = ((await res.json()) as Array<{ result?: unknown }> | null)?.[0];
    if (first && typeof first.result === 'number') count = first.result;
  } catch { return null; }
  return { ok: count <= input.limit, limit: input.limit, remaining: Math.max(0, input.limit - count), resetAt };
}

/** Standard 429 with X-RateLimit-* and Retry-After. */
export function rateLimitResponse(result: FixedWindowResult, message = 'Too many requests. Try again in a few seconds.'): Response {
  const retryAfterSec = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
  return new Response(JSON.stringify({ error: message, retry_after_seconds: retryAfterSec }), {
    status: 429,
    headers: {
      'Content-Type': 'application/json; charset=utf-8', 'Retry-After': String(retryAfterSec),
      'X-RateLimit-Limit': String(result.limit), 'X-RateLimit-Remaining': String(result.remaining),
      'X-RateLimit-Reset': String(Math.floor(result.resetAt / 1000)), 'Cache-Control': 'no-cache, no-transform',
    },
  });
}
