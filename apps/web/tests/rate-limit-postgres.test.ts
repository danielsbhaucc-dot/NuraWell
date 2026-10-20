import { afterEach, describe, expect, it, vi } from 'vitest';

describe('rate-limit postgres backend', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetModules(); });
  it('uses rate_limit_consume RPC and logs a hit once to the audit log', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://x.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'k');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
    const calls: string[] = [];
    let hits = 0;
    const reset = new Date(Date.now() + 60000).toISOString();
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      calls.push(url);
      if (url.endsWith('/rpc/rate_limit_consume')) { hits += 1; return new Response(JSON.stringify([{ hits, reset_at: reset }])); }
      return new Response(null, { status: 201 });
    }));
    const { consumeRateLimit } = await import('@/lib/api/rate-limit');
    const inp = { key: '1.2.3.4', namespace: 't', limit: 2, windowSeconds: 60 };
    expect((await consumeRateLimit(inp)).ok).toBe(true);
    expect((await consumeRateLimit(inp)).ok).toBe(true);
    expect((await consumeRateLimit(inp)).ok).toBe(false);
    expect((await consumeRateLimit(inp)).ok).toBe(false);
    expect(calls.filter((u) => u.endsWith('/admin_audit_log')).length).toBe(1);
  });
  it('falls back to memory when the RPC fails', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://x.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'k');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('no', { status: 500 })));
    const { consumeRateLimit } = await import('@/lib/api/rate-limit');
    const r = await consumeRateLimit({ key: 'a', namespace: 'm', limit: 1, windowSeconds: 60 });
    expect(r.ok).toBe(true);
    expect((await consumeRateLimit({ key: 'a', namespace: 'm', limit: 1, windowSeconds: 60 })).ok).toBe(false);
  });
});
