import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { palette as sharedPalette, isPureWhite, tokensCss } from '@platform/ui';
import { createAiEngine, createMemoryCostSink, createMockProvider, baselinePrivacyGuard, withTimeoutFetch } from '@platform/ai-engine';
import { AuthError, createAuth, memoryAuthAdapter } from '@platform/auth';
import { palette } from '@/lib/theme/tokens';
import { mapMetricsRows } from '@/lib/platform/product-metrics';
import { CATALOG, PRODUCTS } from '@/lib/platform/catalog';

describe('@platform/ui', () => {
  it('apps/web tokens are the shared tokens (re-export, no copy)', () => expect(palette).toBe(sharedPalette));
  it('no pure white in shared tokens', () => {
    for (const c of tokensCss().match(/#[0-9a-fA-F]{3,6}/g) ?? []) expect(isPureWhite(c)).toBe(false);
  });
});

describe('@platform/ai-engine', () => {
  const mk = () => {
    const provider = createMockProvider();
    const sink = createMemoryCostSink();
    const engine = createAiEngine({ productId: 'sample', provider, costSink: sink, models: { cheap: 'c', strong: 's' } });
    return { provider, sink, engine };
  };
  it('logs one cost row tagged with product + feature', async () => {
    const { sink, engine } = mk();
    await engine.ask([{ role: 'user', content: 'שלום' }], { feature: 'smoke', userRef: 'u1' });
    expect(sink.events).toHaveLength(1);
    expect(sink.events[0]).toMatchObject({ productId: 'sample', feature: 'smoke', userRef: 'u1', model: 'mock/c' });
  });
  it('privacy guard always runs before the provider', async () => {
    const { provider, engine } = mk();
    await engine.ask([{ role: 'user', content: 'מייל a.b@example.com טלפון 052-123-4567' }], { feature: 'x' });
    const sent = provider.calls[0].messages[0].content;
    expect(sent).not.toContain('example.com');
    expect(sent).not.toContain('4567');
  });
  it('requires a feature and a valid product id', async () => {
    const { engine } = mk();
    await expect(engine.ask([], { feature: '' })).rejects.toThrow();
    expect(() => createAiEngine({ productId: 'Bad Id', provider: createMockProvider(), costSink: createMemoryCostSink(), models: { cheap: 'a', strong: 'b' } })).toThrow();
  });
  it('a failing cost sink never breaks the reply', async () => {
    const engine = createAiEngine({ productId: 'sample', provider: createMockProvider(() => 'ok'), costSink: { record: async () => { throw new Error('db down'); } }, models: { cheap: 'a', strong: 'b' } });
    expect((await engine.ask([{ role: 'user', content: 'hi' }], { feature: 'x' })).text).toBe('ok');
  });
  it('baseline guard redacts Israeli ID and cards', () => {
    const out = baselinePrivacyGuard([{ role: 'user', content: 'ת"ז 123456782 כרטיס 4580 1234 5678 9012' }])[0].content;
    expect(out).not.toMatch(/\d{6,}/);
  });
  it('withTimeoutFetch is a passthrough when timeout is null', () => {
    const f = (async () => new Response('')) as unknown as typeof fetch;
    expect(withTimeoutFetch(f, null)).toBe(f);
  });
});

describe('@platform/auth (fails closed)', () => {
  const user = { id: 'u1', email: null };
  it('no session → unauthenticated', async () => {
    await expect(createAuth({ productId: 'sample', adapter: memoryAuthAdapter(null) }).requireUser()).rejects.toBeInstanceOf(AuthError);
  });
  it('membership required and missing → not_member', async () => {
    await expect(createAuth({ productId: 'sample', adapter: memoryAuthAdapter(user), requireMembership: true }).requireUser()).rejects.toMatchObject({ code: 'not_member' });
  });
  it('member → ok', async () => {
    const a = createAuth({ productId: 'sample', adapter: memoryAuthAdapter(user, [{ userId: 'u1', productId: 'sample' }]), requireMembership: true });
    await expect(a.requireUser()).resolves.toEqual(user);
  });
  it('adapter throwing → treated as signed out', async () => {
    const a = createAuth({ productId: 'sample', adapter: { currentUser: async () => { throw new Error('x'); } } });
    expect(await a.getUser()).toBeNull();
  });
});

describe('product registry', () => {
  it('sample product is registered in the catalog with the standard roles', () => {
    expect(PRODUCTS.map((p) => p.id)).toContain('sample');
    expect(CATALOG.roles.map((r) => r.id)).toContain('sample.owner');
  });
  it('metrics rows map numerics safely', () => {
    const [m] = mapMetricsRows([{ product_id: 'sample', name: 'S', status: 'active', description: null, key_purpose: 'field:sample', users: '3', ai_cost_30d: '0.0123', ai_calls_30d: 2, errors_7d: null as unknown as number }]);
    expect(m).toMatchObject({ users: 3, aiCost30dUsd: 0.0123, aiCalls30d: 2, errors7d: 0 });
  });
  it('migration 000207: RLS on, nothing for anon, metrics RPC service-role only', () => {
    const sql = readFileSync(path.resolve(__dirname, '../../../supabase/migrations/000207_modular_platform_registry.sql'), 'utf8');
    for (const t of ['platform_product_registry', 'product_memberships']) {
      expect(sql).toContain(`alter table public.${t} enable row level security`);
      expect(sql).toContain(`revoke all on public.${t} from anon, authenticated, public`);
    }
    expect(sql).toContain('revoke all on function public.platform_product_metrics() from public, anon, authenticated');
    expect(sql).not.toMatch(/grant [^;]* to anon/);
    expect(sql).toMatch(/security definer set search_path = public, pg_temp/);
  });
});
