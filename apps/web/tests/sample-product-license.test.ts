import { describe, expect, it } from 'vitest';
import { generateSigningKeyPair, issueLicense, renewLicense, signRevocationList, type RevocationEntry } from '@platform/licensing';
import { centralLicenseStore, loadHubData, type CentralSnapshot } from '../../../packages/@platform/module-library-ui/src/server';
import * as P from '../../../packages/@platform/licensing/src/product';
const SAMPLE_MODULE_ID = 'sample-product', SAMPLE_VERSION = '0.1.0', ID = { productId: 'sample', moduleId: SAMPLE_MODULE_ID, version: SAMPLE_VERSION };
const { newInstanceId } = P;
const createSampleLicense = (c: P.ProductLicenseConfig) => P.createProductLicense(ID, c);
const registerWithControlPlane = (r: Parameters<typeof P.registerWithControlPlane>[0], a: { instanceId: string; host: string }) => P.registerWithControlPlane(r, ID, a);
const sampleLicenseFromEnv = (env: Record<string, string | undefined>) => P.productLicenseFromEnv(ID, env);

const { privatePem, publicPem } = generateSigningKeyPair();
const HOST = 'sample.local';
const T0 = new Date('2026-11-01T00:00:00Z');
const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;

function world() {
  let t = T0.getTime();
  let version = 0;
  let doc: unknown = null;
  let down = false;
  const publish = (entries: RevocationEntry[]) => { doc = signRevocationList(privatePem, { version: ++version, issuedAt: new Date(t).toISOString(), entries }); };
  publish([]);
  const { token, license } = issueLicense(privatePem, { moduleId: SAMPLE_MODULE_ID, versionRange: `^${SAMPLE_VERSION}`, licensee: { id: 'sample-local', name: 'sample-local' }, domains: [HOST], mode: 'bundle', validDays: 30 }, T0);
  const make = (tok = token) => createSampleLicense({ licenseToken: tok, publicKeyPem: publicPem, statusUrl: 'https://status.example/license-status.json', host: HOST, now: () => new Date(t),
    fetch: async () => { if (down) throw new Error('offline'); return JSON.parse(JSON.stringify(doc)); } });
  return { token, license, make, publish, advance: (ms: number) => { t += ms; }, setDown: (v: boolean) => { down = v; }, setDoc: (d: unknown) => { doc = d; } };
}

describe('sample product ↔ central control plane', () => {
  it('registers with an opaque instance id and only a hash of the host', async () => {
    const calls: { fn: string; args: Record<string, unknown> }[] = [];
    const rpc = { rpc: async (fn: string, args: Record<string, unknown> = {}) => { calls.push({ fn, args }); return { data: { instanceId: args.p_instance, productStatus: 'active' }, error: null }; } };
    const id = newInstanceId();
    expect(id).toMatch(/^ins_[A-Za-z0-9_-]{8,64}$/);
    await expect(registerWithControlPlane(rpc, { instanceId: id, host: 'Shop.Example.com' })).resolves.toMatchObject({ productStatus: 'active' });
    expect(calls[0]).toMatchObject({ fn: 'central_register_instance', args: { p_product: 'sample', p_instance: id } });
    expect(String(calls[0].args.p_host_sha256)).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(calls)).not.toContain('example.com');
  });
  it('fails closed when the control plane refuses registration', async () => {
    const rpc = { rpc: async () => ({ data: null, error: { message: 'unknown product' } }) };
    await expect(registerWithControlPlane(rpc, { instanceId: newInstanceId(), host: HOST })).rejects.toThrow('control_plane_refused');
  });
  it('is locked when no license is configured (never open by default)', async () => {
    await expect(sampleLicenseFromEnv({}).status()).resolves.toMatchObject({ state: 'locked', reason: 'no_license' });
  });
  it('works with a valid token and an empty signed status file', async () => {
    const w = world();
    await expect(w.make().status()).resolves.toMatchObject({ state: 'active' });
  });
  it('rejects a token for another host or a forged token', async () => {
    const w = world();
    const other = generateSigningKeyPair();
    const forged = issueLicense(other.privatePem, { moduleId: SAMPLE_MODULE_ID, versionRange: '^0.1.0', licensee: { id: 'evil-co', name: 'x' }, domains: [HOST], mode: 'bundle', validDays: 30 }, T0).token;
    await expect(w.make(forged).status()).resolves.toMatchObject({ state: 'locked', reason: 'bad_signature' });
  });
});

describe('block / unblock via the signed status file (~2 min poll)', () => {
  it('blocks within one poll and unblocks within one poll', async () => {
    const w = world();
    const g = w.make();
    expect((await g.status()).state).toBe('active');
    w.publish([{ lid: w.license.lid, state: 'suspended_until_payment', reason: 'unpaid' }]);
    w.advance(2 * MIN + 1);
    await expect(g.status()).resolves.toMatchObject({ state: 'locked', reason: 'suspended' });
    w.publish([]);
    w.advance(2 * MIN + 1);
    await expect(g.status()).resolves.toMatchObject({ state: 'active' });
  });
  it('permanent revoke locks; a replayed older (unblocked) file cannot undo it', async () => {
    const w = world();
    const g = w.make();
    await g.status();
    const old = signRevocationList(privatePem, { version: 1, issuedAt: T0.toISOString(), entries: [] });
    w.publish([{ lid: w.license.lid, state: 'revoked_permanent', reason: 'terms' }]);
    w.advance(2 * MIN + 1);
    await expect(g.status()).resolves.toMatchObject({ state: 'locked', reason: 'revoked' });
    w.setDoc(old);
    w.advance(2 * MIN + 1);
    await expect(g.status()).resolves.toMatchObject({ state: 'locked', reason: 'revoked' });
  });
  it('a tampered status file is ignored', async () => {
    const w = world();
    const g = w.make();
    await g.status();
    w.setDoc({ list: { v: 1, version: 99, issuedAt: T0.toISOString(), entries: [] }, sig: 'AAAA' });
    w.advance(2 * MIN + 1);
    await expect(g.status()).resolves.toMatchObject({ state: 'active' });
  });
  it('suspended_until lifts by itself after the date', async () => {
    const w = world();
    const g = w.make();
    w.publish([{ lid: w.license.lid, state: 'suspended_until', until: new Date(T0.getTime() + HOUR).toISOString() }]);
    await expect(g.status()).resolves.toMatchObject({ state: 'locked', reason: 'suspended' });
    w.advance(HOUR + 1);
    await expect(g.status()).resolves.toMatchObject({ state: 'active' });
  });
});

describe('expiry = next billing date + 3 grace days', () => {
  it('keeps working through the 3 grace days and locks right after', async () => {
    const w = world();
    const g = w.make();
    w.advance(30 * DAY + 1);                       // billing date passed, unpaid
    await expect(g.status()).resolves.toMatchObject({ state: 'active' });
    w.advance(3 * DAY - 2 * MIN);                  // last minutes of grace
    await expect(g.status()).resolves.toMatchObject({ state: 'active' });
    w.advance(3 * MIN);                            // grace over
    await expect(g.status()).resolves.toMatchObject({ state: 'locked', reason: 'expired' });
  });
  it('a renewed token (payment) restores access with the same license id', async () => {
    const w = world();
    const at = new Date(T0.getTime() + 34 * DAY);
    w.advance(34 * DAY);
    await expect(w.make().status()).resolves.toMatchObject({ state: 'locked', reason: 'expired' });
    const renewed = renewLicense(privatePem, w.license, 30, at);
    expect(renewed.license.lid).toBe(w.license.lid);
    await expect(w.make(renewed.token).status()).resolves.toMatchObject({ state: 'active' });
  });
});

describe('fail closed when the status file cannot be verified for > 6 hours', () => {
  it('works through a short outage, locks after 6h, recovers when the file is back', async () => {
    const w = world();
    const g = w.make();
    expect((await g.status()).state).toBe('active');
    w.setDown(true);
    w.advance(6 * HOUR - MIN);
    await expect(g.status()).resolves.toMatchObject({ state: 'active' });
    w.advance(2 * MIN);
    await expect(g.status()).resolves.toMatchObject({ state: 'locked', reason: 'offline_too_long' });
    w.setDown(false);
    w.advance(2 * MIN + 1);
    await expect(g.status()).resolves.toMatchObject({ state: 'active' });
  });
  it('a forged file during an outage does not count as a successful check', async () => {
    const w = world();
    const g = w.make();
    await g.status();
    w.setDoc({ list: { v: 1, version: 5, issuedAt: T0.toISOString(), entries: [] }, sig: 'bad' });
    w.advance(6 * HOUR + MIN);
    await expect(g.status()).resolves.toMatchObject({ state: 'locked', reason: 'offline_too_long' });
  });
  it('a block seen before the outage stays in force during it', async () => {
    const w = world();
    const g = w.make();
    w.publish([{ lid: w.license.lid, state: 'suspended_until_payment' }]);
    await expect(g.status()).resolves.toMatchObject({ state: 'locked' });
    w.setDown(true);
    w.advance(HOUR);
    await expect(g.status()).resolves.toMatchObject({ state: 'locked', reason: 'suspended' });
  });
});

describe('hub reads from the central DB', () => {
  const snap: CentralSnapshot = {
    products: [{ id: 'nurawell', name: 'NuraWell', status: 'active', description: null }, { id: 'sample', name: 'מוצר לדוגמה', status: 'active', description: null }, { id: 'old', name: 'Old', status: 'disabled', description: null }],
    modules: [{ id: 'iam', name: 'הרשאות', core: true, dependsOn: [] }, { id: 'qc', name: 'בקרת איכות', core: false, dependsOn: [] }],
    states: [{ productId: 'nurawell', moduleId: 'iam', enabled: true }, { productId: 'sample', moduleId: 'iam', enabled: true }, { productId: 'sample', moduleId: 'qc', enabled: false }],
    licenses: [{ lid: 'L-abcdef', moduleId: 'qc', productId: null, licensee: 'shop-example', mode: 'bundle', domains: ['shop.example.com'], issuedAt: T0.toISOString(), expiresAt: null, graceDays: 3, state: 'suspended_until_payment', until: null }],
    statusVersion: 4,
  };
  const emptyDb = () => { const q: any = { select: () => q, in: () => q, order: () => q, limit: () => q, gte: () => q, then: (r: (v: unknown) => void) => r({ data: [], error: null, count: 0 }) }; return { from: (t: string) => { if (t === 'iam_product_modules') throw new Error('must not read product DB states'); return q; } }; };  
  it('products and module states come from the central snapshot', async () => {
    const hub = await loadHubData(emptyDb(), [], { rows: [], error: null }, () => true, snap);
    expect(hub.source).toBe('central');
    expect(hub.products.map((p) => p.id)).toEqual(['nurawell', 'sample']); // disabled product hidden
    expect(hub.products.find((p) => p.id === 'sample')!.enabled).toEqual(['iam']);
  });
  it('license store maps central rows and only ever calls service-role RPCs', async () => {
    const calls: string[] = [];
    const rpc = { rpc: async (fn: string) => { calls.push(fn); return fn === 'central_bump_status_version' ? { data: 5, error: null } : { data: fn === 'central_hub_snapshot' ? snap : null, error: null }; } };
    const store = centralLicenseStore(rpc);
    expect((await store.list())[0]).toMatchObject({ lid: 'L-abcdef', state: 'suspended_until_payment' });
    expect(await store.revocations()).toEqual([{ lid: 'L-abcdef', state: 'suspended_until_payment' }]);
    expect(await store.bumpVersion()).toBe(5);
    await store.clearRevocation('L-abcdef');
    expect(calls.every((c) => c.startsWith('central_'))).toBe(true);
  });
  it('a central error surfaces as a generic error (no DB message leaks)', async () => {
    const store = centralLicenseStore({ rpc: async () => ({ data: null, error: { message: 'relation central.x secret detail' } }) });
    await expect(store.list()).rejects.toThrow('central_unavailable');
  });
});
