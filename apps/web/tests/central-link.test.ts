import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { centralLinkConfigured, createCentralLinkClient, sendCentralSecurityEvent, sendCentralSecurityStatus } from '@/lib/central/central-link';

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
  it('security event + daily status go over the bridge, signed, opt-in only', async () => {
    const sent: { fn: string; args: Record<string, string> }[] = [];
    const f = (async (_u: string, init: RequestInit) => { sent.push(JSON.parse(new TextDecoder().decode(init.body as Uint8Array))); return new Response('{"data":null}', { status: 200 }); }) as unknown as typeof fetch;
    const on = { ...env, KIT_CENTRAL_REPORTING: 'on', CENTRAL_METRICS_FEED_SECRET: 'feed-test' };
    expect(await sendCentralSecurityEvent('break_glass', 'critical', 0, on, f)).toBe('sent');
    expect(await sendCentralSecurityEvent('admin_denied', 'low', 600_000, on, f)).toBe('sent');
    expect(await sendCentralSecurityEvent('admin_denied', 'low', 600_000, on, f)).toBe('throttled');
    expect(await sendCentralSecurityStatus({ encOk: true, openIncidents: 0 }, on, f)).toBe('sent');
    expect(sent.map((s) => s.fn)).toEqual(['central_ingest_security', 'central_ingest_security', 'central_ingest_security']);
    expect(sent[0].args.p_sig).toMatch(/^[0-9a-f]{64}$/); expect(JSON.parse(sent[2].args.p_body)).toEqual({ type: 'status', status: { encOk: true, openIncidents: 0 } });
    expect('p_product' in sent[0].args).toBe(false);
    expect(await sendCentralSecurityEvent('break_glass', 'critical', 0, { ...on, KIT_CENTRAL_REPORTING: 'off' }, f)).toBe('skipped');
    expect(await sendCentralSecurityEvent('Bad Kind!', 'high', 0, on, f)).toBe('skipped');
  });
  it('no runtime code reads CENTRAL_SUPABASE_SECRET_KEY any more', () => {
    const hits: string[] = [];
    const walk = (d: string) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (/\.(ts|tsx|js|mjs)$/.test(n) && !/\.generated\./.test(n) && readFileSync(p, 'utf8').includes('CENTRAL_SUPABASE_SECRET_KEY')) hits.push(p); } };
    const feedUsers = ['lib/central/usage-feed.ts', 'lib/ops/security-events.ts', 'lib/logs/signals.ts'].filter((p) => /sendSecurity(Event|Status)\b/.test(readFileSync(p, 'utf8').replace(/sendCentralSecurity/g, '')));
    expect(feedUsers).toEqual([]); // the kit's direct sender (which reads the key) is no longer called
    for (const d of ['app', 'lib', 'components', 'middleware.ts', 'proxy.ts']) { try { statSync(d).isDirectory() ? walk(d) : (readFileSync(d, 'utf8').includes('CENTRAL_SUPABASE_SECRET_KEY') && hits.push(d)); } catch { /* absent */ } }
    expect(hits).toEqual([]);
  });
});
