import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { centralLinkConfigured, createCentralLinkClient } from '@/lib/central/central-link';

const env = { CENTRAL_SUPABASE_URL: 'https://central.example', PRODUCT_LINK_KEY_ID: 'pk_abcdefghijklmnop', PRODUCT_LINK_SECRET: 'test-only-secret' };

describe('central control plane via signed product-link (no service key)', () => {
  it('is configured by the product-link key, not by the central secret key', () => {
    expect(centralLinkConfigured(env)).toBe(true);
    expect(centralLinkConfigured({ CENTRAL_SUPABASE_URL: env.CENTRAL_SUPABASE_URL, CENTRAL_SUPABASE_SECRET_KEY: 'x' })).toBe(false);
    expect(centralLinkConfigured({ ...env, CENTRAL_SUPABASE_URL: 'http://central.example' })).toBe(false);
  });
  it('sends a signed POST /v1/central { fn, args } and returns { data }', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const f = (async (url: string, init: RequestInit) => { calls.push({ url, init }); return new Response(JSON.stringify({ data: { states: [] } }), { status: 200 }); }) as unknown as typeof fetch;
    const r = await createCentralLinkClient(env, f).rpc('central_module_states', { p_product: 'nurawell' });
    expect(r).toEqual({ data: { states: [] }, error: null });
    expect(calls[0].url).toBe('https://central.example/functions/v1/product-link/v1/central');
    const h = calls[0].init.headers as Record<string, string>;
    expect(h['x-pl-key']).toBe(env.PRODUCT_LINK_KEY_ID);
    expect(h['x-pl-sig']).toMatch(/.{20,}/); expect(h['x-pl-nonce']).toBeTruthy(); expect(h['x-pl-ts']).toMatch(/^\d{13}$/);
    expect(JSON.stringify(h)).not.toContain(env.PRODUCT_LINK_SECRET);
    expect(JSON.parse(new TextDecoder().decode(calls[0].init.body as Uint8Array))).toEqual({ fn: 'central_module_states', args: { p_product: 'nurawell' } });
  });
  it('maps refusals to a short code (dependency_disabled survives for the module toggle) and never throws', async () => {
    const f409 = (async () => new Response(JSON.stringify({ error: 'dependency_disabled' }), { status: 409 })) as unknown as typeof fetch;
    expect((await createCentralLinkClient(env, f409).rpc('central_set_module_state')).error?.message).toBe('dependency_disabled');
    const boom = (async () => { throw new Error('net secret'); }) as unknown as typeof fetch;
    expect(await createCentralLinkClient(env, boom).rpc('central_hub_snapshot')).toEqual({ data: null, error: { message: 'central_unavailable' } });
    expect((await createCentralLinkClient({}, boom).rpc('central_hub_snapshot')).error?.message).toBe('central_not_configured');
  });
  it('no runtime code reads CENTRAL_SUPABASE_SECRET_KEY any more', () => {
    const hits: string[] = [];
    const walk = (d: string) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (/\.(ts|tsx|js|mjs)$/.test(n) && !/\.generated\./.test(n) && readFileSync(p, 'utf8').includes('CENTRAL_SUPABASE_SECRET_KEY')) hits.push(p); } };
    for (const d of ['app', 'lib', 'components', 'middleware.ts', 'proxy.ts']) { try { statSync(d).isDirectory() ? walk(d) : (readFileSync(d, 'utf8').includes('CENTRAL_SUPABASE_SECRET_KEY') && hits.push(d)); } catch { /* absent */ } }
    expect(hits).toEqual([]);
  });
});
