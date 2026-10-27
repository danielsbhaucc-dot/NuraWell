import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const centralCalls: { fn: string; args?: Record<string, unknown> }[] = [];
let centralReply: (fn: string, args?: Record<string, unknown>) => { data: unknown; error: { message: string } | null } = () => ({ data: null, error: null });
vi.mock('@/lib/supabase/admin', () => ({
  createCentralAdminClient: () => ({ rpc: async (fn: string, args?: Record<string, unknown>) => { centralCalls.push({ fn, args }); return centralReply(fn, args); } }),
  createAdminClient: () => ({}),
}));
import { FOUNDER_ROLE, ALL_PRODUCTS, type Actor } from '@platform/iam';
import { toggleModule } from '@/lib/platform/iam-admin';
import { loadModuleStates } from '@/lib/platform/authorize';
import { createCentralModuleSource, setCentralModuleState, syncModulesToCentral, RUNTIME_MAX_STALE_MS } from '../../../packages/@platform/module-library-ui/src/server';
import type { GuardStatus } from '@platform/licensing';

const CORE = ['security-core', 'iam'];
const snap = (states: Record<string, boolean>, productStatus = 'active') => ({ productStatus, ownedByUs: true, core: CORE, synced: true, states: Object.entries(states).map(([moduleId, enabled]) => ({ moduleId, enabled })) });
const on = (r: { states: { moduleId: string; enabled: boolean }[] }, id: string) => Boolean(r.states.find((s) => s.moduleId === id)?.enabled);

function harness(first: unknown = snap({ qc: true, billing: false })) {
  let t = 1_000_000, reply: { data: unknown; error: { message: string } | null } = { data: first, error: null }, calls = 0;
  const db = { rpc: async () => { calls++; return reply; } };
  return { db, now: () => t, tick: (ms: number) => { t += ms; }, set: (r: typeof reply) => { reply = r; }, calls: () => calls };
}
const down = { data: null, error: { message: 'connection refused' } };
const lic = (state: GuardStatus['state']) => ({ status: async () => ({ state, reason: state === 'active' ? 'ok' : 'revoked', message: '' } as unknown as GuardStatus) });

describe('NuraWell consumes module states from central (runtime source)', () => {
  it('reads central states; core always on', async () => {
    const h = harness();
    const r = await createCentralModuleSource({ db: h.db, productId: 'nurawell', coreIds: CORE, now: h.now }).get();
    expect(r.source).toBe('central');
    expect(on(r, 'qc')).toBe(true); expect(on(r, 'billing')).toBe(false); expect(on(r, 'iam')).toBe(true); expect(on(r, 'security-core')).toBe(true);
  });
  it('polls at most every 2 minutes; fresh bypasses the cache', async () => {
    const h = harness();
    const s = createCentralModuleSource({ db: h.db, productId: 'nurawell', coreIds: CORE, now: h.now });
    await s.get(); h.tick(60_000); await s.get(); expect(h.calls()).toBe(1);
    h.tick(61_000); await s.get(); expect(h.calls()).toBe(2);
    await s.get({ fresh: true }); expect(h.calls()).toBe(3);
    s.invalidate(); await s.get(); expect(h.calls()).toBe(4);
  });
  it('central outage < 6h keeps last verified states; > 6h fails closed for non-core only; recovers', async () => {
    const h = harness();
    const s = createCentralModuleSource({ db: h.db, productId: 'nurawell', coreIds: CORE, now: h.now });
    await s.get(); h.set(down);
    h.tick(RUNTIME_MAX_STALE_MS - 1000);
    let r = await s.get(); expect(r.source).toBe('cache'); expect(on(r, 'qc')).toBe(true);
    h.tick(2000);
    r = await s.get(); expect(r.source).toBe('failsafe'); expect(on(r, 'qc')).toBe(false); expect(on(r, 'iam')).toBe(true); expect(on(r, 'security-core')).toBe(true);
    h.set({ data: snap({ qc: true }), error: null });
    r = await s.get(); expect(r.source).toBe('central'); expect(on(r, 'qc')).toBe(true);
  });
  it('central down from a cold start: core on, non-core off (never open by default)', async () => {
    const h = harness(); h.set(down);
    const r = await createCentralModuleSource({ db: h.db, productId: 'nurawell', coreIds: CORE, now: h.now }).get();
    expect(r.source).toBe('failsafe'); expect(r.states.filter((x) => x.enabled).map((x) => x.moduleId).sort()).toEqual(CORE.slice().sort());
  });
  it('malformed central answer is treated as an outage', async () => {
    const h = harness({ states: 'nope' });
    expect((await createCentralModuleSource({ db: h.db, productId: 'nurawell', coreIds: CORE, now: h.now }).get()).source).toBe('failsafe');
  });
  it('OWNED product: license locked / guard error never turns modules off, only raises an admin alert; manual toggles apply', async () => {
    for (const [l, alert] of [[lic('locked'), true], [lic('active'), false], [{ status: async () => { throw new Error('x'); } }, true]] as const) {
      const h = harness();
      const r = await createCentralModuleSource({ db: h.db, productId: 'nurawell', coreIds: CORE, now: h.now, license: l }).get();
      expect(on(r, 'qc')).toBe(true); expect(on(r, 'billing')).toBe(false); expect(on(r, 'iam')).toBe(true);
      expect(r.licenseAlert).toBe(alert);
      expect(r.failClosed).toBe(false);
    }
  });
  it('OWNED product: central down from cold start → gate never blocks (local ownedByUs fallback)', async () => {
    const h = harness(); h.set(down);
    const r = await createCentralModuleSource({ db: h.db, productId: 'nurawell', coreIds: CORE, now: h.now, ownedByUs: true }).get();
    expect(r.failClosed).toBe(false);
  });
});

describe('CUSTOMER products: entitlement allowlist with license type', () => {
  const DAY = 86_400_000;
  const cust = (ents: unknown[]) => ({ ...snap({ qc: true, billing: true, journey: true }), ownedByUs: false, entitlements: ents });
  const iso = (ms: number) => new Date(ms).toISOString();
  it('only entitled modules work; core always on', async () => {
    const h = harness(cust([{ moduleId: 'qc', licenseType: 'perpetual' }]));
    const r = await createCentralModuleSource({ db: h.db, productId: 'acme', coreIds: CORE, now: h.now }).get();
    expect(on(r, 'qc')).toBe(true); expect(on(r, 'billing')).toBe(false); expect(on(r, 'iam')).toBe(true); expect(r.failClosed).toBe(true);
  });
  it('subscription unpaid past grace → locked (users too); within grace → works', async () => {
    const h = harness();
    h.set({ data: cust([{ moduleId: 'qc', licenseType: 'subscription', paidThrough: iso(1_000_000 - 2 * DAY), graceDays: 3 }]), error: null });
    const s = createCentralModuleSource({ db: h.db, productId: 'acme', coreIds: CORE, now: h.now });
    expect(on(await s.get(), 'qc')).toBe(true);
    h.tick(2 * DAY); // cached snapshot still expires on time
    const r = await s.get({ fresh: true });
    expect(on(r, 'qc')).toBe(false); expect(on({ states: r.userStates }, 'qc')).toBe(false);
  });
  it('perpetual unpaid keeps working forever; revoked stops it', async () => {
    const h = harness(cust([{ moduleId: 'qc', licenseType: 'perpetual', paidThrough: null }, { moduleId: 'journey', licenseType: 'perpetual', revoked: true }]));
    const r2 = await createCentralModuleSource({ db: harness(cust([{ moduleId: 'qc', licenseType: 'perpetual' }])).db, productId: 'acme', coreIds: CORE, now: () => 1e15 }).get(); // ~30k years later, never paid
    expect(on(r2, 'qc')).toBe(true);
    expect(on(await createCentralModuleSource({ db: h.db, productId: 'acme', coreIds: CORE, now: h.now }).get(), 'journey')).toBe(false);
  });
  it('central down, no cache → customer non-core off and the gate blocks (fail closed)', async () => {
    const h = harness(); h.set(down);
    const r = await createCentralModuleSource({ db: h.db, productId: 'acme', coreIds: CORE, now: h.now, ownedByUs: false }).get();
    expect(r.failClosed).toBe(true); expect(r.states.filter((x) => x.enabled).map((x) => x.moduleId).sort()).toEqual(CORE.slice().sort());
  });
  it('product disabled in central → non-core off, core on', async () => {
    const h = harness(snap({ qc: true }, 'disabled'));
    const r = await createCentralModuleSource({ db: h.db, productId: 'nurawell', coreIds: CORE, now: h.now }).get();
    expect(on(r, 'qc')).toBe(false); expect(on(r, 'security-core')).toBe(true);
  });
  it('central cannot switch a core module off', async () => {
    const h = harness(snap({ iam: false, 'security-core': false }));
    const r = await createCentralModuleSource({ db: h.db, productId: 'nurawell', coreIds: CORE, now: h.now }).get();
    expect(on(r, 'iam')).toBe(true); expect(on(r, 'security-core')).toBe(true);
  });
});

describe('central write + sync RPC wrappers', () => {
  it('maps errors without leaking DB messages', async () => {
    const mk = (error: { message: string } | null) => ({ rpc: async () => ({ data: null, error }) });
    expect(await setCentralModuleState(mk(null), { actorId: 'a', productId: 'p', moduleId: 'qc', enabled: true })).toEqual({ ok: true });
    expect(await setCentralModuleState(mk({ message: 'dependency_disabled' }), { actorId: 'a', productId: 'p', moduleId: 'qc', enabled: true })).toEqual({ ok: false, reason: 'dependency_disabled' });
    expect(await setCentralModuleState(mk({ message: 'secret detail' }), { actorId: 'a', productId: 'p', moduleId: 'qc', enabled: true })).toEqual({ ok: false, reason: 'central_refused' });
    await expect(syncModulesToCentral(mk({ message: 'secret detail' }), { actorId: null, productId: 'p', rows: [] })).rejects.toThrow('central_sync_failed');
  });
});

describe('NuraWell hub writes go to central (single source of truth)', () => {
  const U = '11111111-1111-1111-1111-111111111111';
  const founder: Actor = { userId: U, kind: 'human', grants: [{ userId: U, roleId: FOUNDER_ROLE, productId: ALL_PRODUCTS, expiresAt: null, revokedAt: null }] };
  const local = () => {
    const writes: { table: string; row: unknown }[] = [];
    const client = { from: (table: string) => ({
      upsert: async (row: unknown) => { writes.push({ table, row }); return { error: null }; },
      insert: async (row: unknown) => { writes.push({ table, row }); return { error: null }; },
      select: () => ({ eq: async () => ({ data: [{ product_id: 'nurawell', module_id: 'qc', enabled: true }], error: null }) }),
    }) };
    return { client: client as never, writes };
  };
  const alert = async () => undefined;
  beforeEach(() => { centralCalls.length = 0; process.env.CENTRAL_SUPABASE_URL = 'https://central.example'; process.env.CENTRAL_SUPABASE_SECRET_KEY = 'test-only'; });
  afterEach(() => { delete process.env.CENTRAL_SUPABASE_URL; delete process.env.CENTRAL_SUPABASE_SECRET_KEY; });

  it('one-time sync first, then the write goes to central only (never to iam_product_modules)', async () => {
    centralReply = (fn) => ({ data: fn === 'central_sync_module_states' ? { skipped: false, rows: 1 } : null, error: null });
    const d = local();
    expect(await toggleModule(d.client, founder, 'nurawell', 'qc', false, { steppedUp: true, alert })).toEqual({ ok: true });
    expect(centralCalls.map((c) => c.fn)).toEqual(['central_sync_module_states', 'central_set_module_state']);
    expect(centralCalls[0].args).toMatchObject({ p_product: 'nurawell', p_rows: [{ moduleId: 'qc', enabled: true }] });
    expect(centralCalls[1].args).toEqual({ p_actor: U, p_product: 'nurawell', p_module: 'qc', p_enabled: false });
    expect(d.writes.some((w) => w.table === 'iam_product_modules')).toBe(false);
    // sync is remembered: the next write doesn't sync again
    centralCalls.length = 0;
    await toggleModule(d.client, founder, 'nurawell', 'qc', true, { steppedUp: true, alert });
    expect(centralCalls.map((c) => c.fn)).toEqual(['central_set_module_state']);
  });
  it('central down: nothing is written anywhere, a clear 503 comes back (read-only fallback)', async () => {
    centralReply = () => ({ data: null, error: { message: 'down' } });
    const d = local();
    const r = await toggleModule(d.client, founder, 'nurawell', 'billing', true, { steppedUp: true, alert });
    expect(r).toMatchObject({ ok: false, status: 503, reason: 'central_unavailable' });
    expect(d.writes.some((w) => w.table === 'iam_product_modules')).toBe(false);
  });
  it('core modules are refused before reaching central', async () => {
    const d = local();
    expect(await toggleModule(d.client, founder, 'nurawell', 'iam', false, { steppedUp: true, alert })).toMatchObject({ ok: false, reason: 'core_module' });
    expect(centralCalls.some((c) => c.fn === 'central_set_module_state')).toBe(false);
  });
  it('authorize reads module states from central; without central env it reads NuraWell (legacy)', async () => {
    centralReply = (fn) => ({ data: fn === 'central_module_states' ? snap({ qc: false }) : { skipped: true }, error: null });
    const d = local();
    const states = await loadModuleStates(d.client, 'sample', { fresh: true });
    expect(states.find((s) => s.moduleId === 'qc')?.enabled).toBe(false);
    expect(centralCalls.some((c) => c.fn === 'central_module_states')).toBe(true);
    delete process.env.CENTRAL_SUPABASE_URL;
    expect((await loadModuleStates(d.client, 'sample')).find((s) => s.moduleId === 'qc')?.enabled).toBe(true);
  });
});

describe('entitlementActive', () => {
  it('status expired/canceled ends even a perpetual; past_due within grace still works', async () => {
    const { entitlementActive } = await import('../../../packages/@platform/module-library-ui/src/server/central-runtime');
    expect(entitlementActive({ moduleId: 'qc', licenseType: 'perpetual', status: 'canceled' }, 0)).toBe(false);
    expect(entitlementActive({ moduleId: 'qc', licenseType: 'subscription', status: 'past_due', paidThrough: new Date(0).toISOString(), graceDays: 3 }, 86_400_000)).toBe(true);
    expect(entitlementActive({ moduleId: 'qc', licenseType: 'subscription', paidThrough: null }, 0)).toBe(false);
  });
});
