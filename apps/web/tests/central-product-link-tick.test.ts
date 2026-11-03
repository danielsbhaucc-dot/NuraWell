import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { verifyRequest, checkUsage, checkHeartbeat, checkDecisions, UUID, findPii } from '@core/product-link';

const aiRows = [
  { feature: 'chat', prompt_tokens: 1000, completion_tokens: 200, cost_usd: '0.0042' },
  { feature: 'almog_reply_qc', prompt_tokens: 10, completion_tokens: 5, cost_usd: 0.00001 },
  { feature: 'embeddings', prompt_tokens: 50, completion_tokens: 0, cost_usd: 0.000003 },
];
const dbState = { fail: false };
const mockQuery = (count: number, data?: unknown) => {
  const chain: Record<string, unknown> = {};
  for (const method of ['select', 'gte', 'lt', 'in', 'eq', 'limit']) chain[method] = () => chain;
  chain.then = (resolve: (value: unknown) => unknown) => resolve(dbState.fail ? { error: { message: 'down' }, count: null, data: null } : { error: null, count, data });
  return chain;
};
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (table: string) => (table === 'ai_usage_events' ? mockQuery(0, aiRows) : mockQuery(table === 'profiles' ? 4 : 0)) }),
}));

import { runLinkTick, eventId, linkVersion, isAlmogFeature, collectDaily } from '@/lib/central/product-link-tick';

const testEnv = {
  CENTRAL_SUPABASE_URL: 'https://central.example.supabase.co',
  PRODUCT_LINK_KEY_ID: 'pk_abcdefghij012345',
  PRODUCT_LINK_SECRET: 'test-only-'.padEnd(43, 'x'),
  VERCEL_GIT_COMMIT_SHA: '67d17d22aa',
};
const NOW = Date.parse('2026-11-03T08:00:00Z');
interface Captured { path: string; body: unknown; headers: Record<string, string>; raw: Uint8Array }

const fakeFetch = () => {
  const calls: Captured[] = [];
  const fetchImpl = ((url: string, init?: RequestInit) => {
    const parsed = new URL(url);
    if (parsed.pathname.endsWith('/license-status')) return Promise.resolve(new Response('unavailable', { status: 503 }));
    const raw = init?.body as Uint8Array;
    calls.push({ path: parsed.pathname.replace('/functions/v1/product-link', ''), body: JSON.parse(new TextDecoder().decode(raw)), headers: init?.headers as Record<string, string>, raw });
    return Promise.resolve(new Response(null, { status: 202 }));
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
};

describe('NuraWell ↔ platform link tick (shadow)', () => {
  beforeEach(() => { dbState.fail = false; });

  it('skips cleanly when not configured (no network)', async () => {
    const { fetchImpl, calls } = fakeFetch();
    expect((await runLinkTick({}, fetchImpl, NOW)).status).toBe('skipped');
    expect(calls).toHaveLength(0);
  });

  it('version = package version + short git sha, and valid', () => {
    expect(linkVersion(testEnv)).toBe('1.0.0+67d17d2');
    expect(linkVersion({})).toBe('1.0.0');
    expect(linkVersion({ VERCEL_GIT_COMMIT_SHA: 'x; drop' })).toBe('1.0.0');
  });

  it('deterministic UUID event ids per (day, metric)', async () => {
    const first = await eventId('2026-11-02', 'ai.calls');
    expect(first).toMatch(UUID);
    expect(await eventId('2026-11-02', 'ai.calls')).toBe(first);
    expect(await eventId('2026-11-01', 'ai.calls')).not.toBe(first);
  });

  it('Almog feature mapping', () => {
    expect(['chat', 'chat_router', 'almog_notify_qc'].every(isAlmogFeature)).toBe(true);
    expect(['embeddings', 'gideon_chat', 'cron:memory-pipeline', null].some(isAlmogFeature)).toBe(false);
  });

  it('collects yesterday counts only', async () => {
    const daily = await collectDaily(NOW);
    expect(daily?.day).toBe('2026-11-02');
    expect(daily?.metrics['ai.calls']).toBe(3);
    expect(daily?.metrics['almog.calls']).toBe(2);
    expect(daily?.metrics['almog.tokens_in']).toBe(1010);
    expect(daily?.metrics['almog.cost_usd_e5']).toBe(421);
    expect(Object.values(daily?.metrics ?? {}).every((value) => Number.isInteger(value) && value >= 0 && value <= 1e6)).toBe(true);
  });

  it('sends signed heartbeat, usage and a shadow decision that never blocks', async () => {
    const { fetchImpl, calls } = fakeFetch();
    const result = await runLinkTick(testEnv, fetchImpl, NOW);
    expect(result).toMatchObject({ status: 'sent', heartbeat: 202, usage: 202, decisions: [202], health: 'ok', version: '1.0.0+67d17d2' });
    for (const call of calls) {
      const headers = new Headers(call.headers);
      expect(headers.get('x-pl-key')).toBe(testEnv.PRODUCT_LINK_KEY_ID);
      const signature = { ts: headers.get('x-pl-ts'), nonce: headers.get('x-pl-nonce'), sig: headers.get('x-pl-sig') };
      expect(await verifyRequest(signature, testEnv.PRODUCT_LINK_SECRET, call.path, call.raw, 300_000, NOW)).toBe(true);
      expect(findPii(call.body)).toBeNull();
    }
    const byPath = (path: string) => calls.find((call) => call.path === path)?.body;
    expect(checkHeartbeat(byPath('/v1/heartbeat')).ok).toBe(true);
    expect(checkUsage(byPath('/v1/usage'), NOW).ok).toBe(true);
    expect(checkDecisions(byPath('/v1/decisions'), NOW).ok).toBe(true);
    const events = (byPath('/v1/usage') as { events: { metric: string; n: number }[] }).events;
    expect(events.find((event) => event.metric === 'shadow.would_block')?.n).toBe(4);
    const decisions = (byPath('/v1/decisions') as { decisions: { local: string; reason: string; lic: unknown }[] }).decisions;
    expect(decisions).toHaveLength(1);
    expect(decisions[0]).toMatchObject({ local: 'block', lic: null });
    expect(['no_status', 'no_license']).toContain(decisions[0]?.reason);
  });

  it('DB failure ⇒ degraded heartbeat, no usage, never throws', async () => {
    dbState.fail = true;
    const { fetchImpl, calls } = fakeFetch();
    const result = await runLinkTick(testEnv, fetchImpl, NOW);
    expect(result.health).toBe('degraded');
    expect(calls.some((call) => call.path === '/v1/usage')).toBe(false);
  });

  it('network down never throws', async () => {
    const failing = (() => Promise.reject(new Error('down'))) as unknown as typeof fetch;
    expect(await runLinkTick(testEnv, failing, NOW)).toMatchObject({ status: 'sent', heartbeat: 0 });
  });

  it('route: POST only, timing-safe bearer, tiny body, no Almog/auth imports', () => {
    const route = readFileSync(join(__dirname, '../app/api/v1/central/link-tick/route.ts'), 'utf8');
    expect(route).toMatch(/timingSafeEqualStr/);
    expect(route).toMatch(/MIN_BEARER_LENGTH = 32/);
    expect(route).not.toMatch(/export async function GET/);
    const lib = readFileSync(join(__dirname, '../lib/central/product-link-tick.ts'), 'utf8');
    expect(lib).not.toMatch(/from '@\/lib\/(ai|almog|auth)/);
    expect(lib).not.toMatch(/\.(insert|update|upsert|delete|rpc)\(/);
  });
});
