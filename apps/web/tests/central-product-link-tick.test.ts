import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { verifyRequest, checkUsage, checkHeartbeat, checkDecisions, UUID, findPii } from '@core/product-link';

const rows = [
  { feature: 'chat', prompt_tokens: 1000, completion_tokens: 200, cost_usd: '0.0042' },
  { feature: 'almog_reply_qc', prompt_tokens: 10, completion_tokens: 5, cost_usd: 0.00001 },
  { feature: 'embeddings', prompt_tokens: 50, completion_tokens: 0, cost_usd: 0.000003 },
];
let fail = false;
const q = (n: number, data?: unknown) => { const o: Record<string, unknown> = {}; for (const k of ['select', 'gte', 'lt', 'in', 'eq', 'limit']) o[k] = () => o; o.then = (r: (v: unknown) => unknown) => r(fail ? { error: { m: 'x' }, count: null, data: null } : { error: null, count: n, data }); return o; };
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: (t: string) => t === 'ai_usage_events' ? q(0, rows) : q(t === 'profiles' ? 4 : 0) }) }));

import { runLinkTick, eventId, linkVersion, isAlmogFeature, collectDaily } from '@/lib/central/product-link-tick';

const env = { CENTRAL_SUPABASE_URL: 'https://central.example.supabase.co', PRODUCT_LINK_KEY_ID: 'pk_abcdefghij012345', PRODUCT_LINK_SECRET: 's'.repeat(43), VERCEL_GIT_COMMIT_SHA: '67d17d22aa' };
const NOW = Date.parse('2026-11-03T08:00:00Z');

function fakeFetch() {
  const calls: { path: string; body: unknown; headers: Record<string, string>; raw: Uint8Array }[] = [];
  const f = (async (u: string, i?: RequestInit) => {
    const url = new URL(u);
    if (url.pathname.endsWith('/license-status')) return new Response('nope', { status: 503 });
    const raw = i!.body as Uint8Array;
    calls.push({ path: url.pathname.replace('/functions/v1/product-link', ''), body: JSON.parse(new TextDecoder().decode(raw)), headers: i!.headers as Record<string, string>, raw });
    return new Response(null, { status: 202 });
  }) as unknown as typeof fetch;
  return { f, calls };
}

describe('NuraWell ↔ platform link tick (shadow)', () => {
  beforeEach(() => { fail = false; });
  it('skips cleanly when not configured (no network)', async () => {
    const { f, calls } = fakeFetch();
    expect((await runLinkTick({}, f, NOW)).status).toBe('skipped');
    expect(calls).toHaveLength(0);
  });
  it('version = package version + short git sha, and valid', () => {
    expect(linkVersion(env)).toBe('1.0.0+67d17d2');
    expect(linkVersion({})).toBe('1.0.0');
    expect(linkVersion({ VERCEL_GIT_COMMIT_SHA: 'x; drop' })).toBe('1.0.0');
  });
  it('deterministic UUID event ids per (day, metric)', async () => {
    const a = await eventId('2026-11-02', 'ai.calls');
    expect(a).toMatch(UUID);
    expect(await eventId('2026-11-02', 'ai.calls')).toBe(a);
    expect(await eventId('2026-11-01', 'ai.calls')).not.toBe(a);
  });
  it('Almog feature mapping', () => {
    expect(['chat', 'chat_router', 'almog_notify_qc'].every(isAlmogFeature)).toBe(true);
    expect(['embeddings', 'gideon_chat', 'cron:memory-pipeline', null].some(isAlmogFeature)).toBe(false);
  });
  it('collects yesterday counts only', async () => {
    const d = await collectDaily(NOW);
    expect(d!.day).toBe('2026-11-02');
    expect(d!.metrics['ai.calls']).toBe(3);
    expect(d!.metrics['almog.calls']).toBe(2);
    expect(d!.metrics['almog.tokens_in']).toBe(1010);
    expect(d!.metrics['almog.cost_usd_e5']).toBe(421);
    expect(Object.values(d!.metrics).every(n => Number.isInteger(n) && n >= 0 && n <= 1e6)).toBe(true);
  });
  it('sends signed heartbeat, usage and a shadow decision that never blocks', async () => {
    const { f, calls } = fakeFetch();
    const r = await runLinkTick(env, f, NOW);
    expect(r).toMatchObject({ status: 'sent', heartbeat: 202, usage: 202, decisions: [202], health: 'ok', version: '1.0.0+67d17d2' });
    for (const c of calls) {
      const h = new Headers(c.headers);
      expect(h.get('x-pl-key')).toBe(env.PRODUCT_LINK_KEY_ID);
      expect(await verifyRequest({ ts: h.get('x-pl-ts'), nonce: h.get('x-pl-nonce'), sig: h.get('x-pl-sig') }, env.PRODUCT_LINK_SECRET, c.path, c.raw, 300_000, NOW)).toBe(true);
      expect(findPii(c.body)).toBeNull();
    }
    const hb = calls.find(c => c.path === '/v1/heartbeat')!, us = calls.find(c => c.path === '/v1/usage')!, de = calls.find(c => c.path === '/v1/decisions')!;
    expect(checkHeartbeat(hb.body).ok).toBe(true);
    expect(checkUsage(us.body, NOW).ok).toBe(true);
    expect(checkDecisions(de.body, NOW).ok).toBe(true);
    const ev = (us.body as { events: { metric: string; n: number }[] }).events;
    expect(ev.find(e => e.metric === 'shadow.would_block')?.n).toBe(4);
    const dec = (de.body as { decisions: { local: string; reason: string; lic: unknown }[] }).decisions;
    expect(dec).toHaveLength(1);
    expect(dec[0]).toMatchObject({ local: 'block', lic: null });
    expect(['no_status', 'no_license']).toContain(dec[0]!.reason);
  });
  it('DB failure ⇒ degraded heartbeat, no usage, never throws', async () => {
    fail = true;
    const { f, calls } = fakeFetch();
    const r = await runLinkTick(env, f, NOW);
    expect(r.health).toBe('degraded');
    expect(calls.some(c => c.path === '/v1/usage')).toBe(false);
  });
  it('network down never throws', async () => {
    const r = await runLinkTick(env, (async () => { throw new Error('down'); }) as unknown as typeof fetch, NOW);
    expect(r).toMatchObject({ status: 'sent', heartbeat: 0 });
  });
  it('route: POST only, timing-safe bearer, tiny body, no Almog/auth imports', () => {
    const src = readFileSync(join(__dirname, '../app/api/v1/central/link-tick/route.ts'), 'utf8');
    expect(src).toMatch(/timingSafeEqualStr/);
    expect(src).toMatch(/want\.length < 32/);
    expect(src).not.toMatch(/export async function GET/);
    const lib = readFileSync(join(__dirname, '../lib/central/product-link-tick.ts'), 'utf8');
    expect(lib).not.toMatch(/from '@\/lib\/(ai|almog|auth)/);
    expect(lib).not.toMatch(/\.(insert|update|upsert|delete|rpc)\(/);
  });
});
