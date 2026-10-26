import { describe, it, expect, vi } from 'vitest';
import {
  generateSigningKeyPair, issueLicense, signRevocationList, createLicenseGuard, memoryRevocationPublisher, cloudflareStaticPublisher, shardKey,
  OFFLINE_MESSAGE, type RevocationEntry, type SignedRevocationList,
} from '../../../packages/@platform/licensing/src';
import { createVerifierHandler, memoryStatusStore, statusStorage, signStatusUpdate, localStatusPusher, applyStatusUpdate, checkOnline } from '../../../packages/@platform/licensing/src/online';
import { licenseAction, type Deps, type LicenseStore } from '../../../packages/@platform/module-library-ui/src/server/actions';

const K = generateSigningKeyPair();
const T0 = new Date('2026-10-01T00:00:00Z').getTime();
const min = (n: number) => n * 60_000;
const { token, license } = issueLicense(K.privatePem, { moduleId: 'm', versionRange: '^1.0.0', licensee: { id: 'c1', name: 'c1' }, domains: ['shop.example.com'], mode: 'bundle' }, new Date(T0));
const doc = (version: number, entries: RevocationEntry[]) => signRevocationList(K.privatePem, { version, issuedAt: new Date(T0).toISOString(), entries });

/** Simulated static file host with ~60s CDN cache. */
function staticHost() {
  let origin: SignedRevocationList | null = doc(1, []); let edge: { at: number; d: unknown } | null = null; let down = false; let clock = T0;
  return {
    set: (d: SignedRevocationList | null) => { origin = d; }, down: (v: boolean) => { down = v; }, tick: (ms: number) => { clock += ms; }, now: () => new Date(clock),
    fetch: async () => { if (down) throw new Error('offline'); if (!edge || clock - edge.at >= 60_000) edge = { at: clock, d: JSON.parse(JSON.stringify(origin)) }; return edge.d; },
  };
}
const guardOn = (h: ReturnType<typeof staticHost>) => createLicenseGuard({ moduleId: 'm', version: '1.0.0', publicKeyPem: K.publicPem, licenseToken: token, host: 'shop.example.com', revocationUrl: 'https://static.example/license-status.json', fetch: h.fetch, now: h.now });

describe('static signed status file (primary path, no Worker per check)', () => {
  it('block takes effect after cache expiry + next poll (≤ ~3 min); unblock restores', async () => {
    const h = staticHost(); const g = guardOn(h);
    expect((await g.status()).state).toBe('active');
    h.set(doc(2, [{ lid: license.lid, state: 'suspended_until_payment', reason: 'unpaid' }]));
    h.tick(min(1)); expect((await g.status()).state).toBe('active'); // still within poll interval
    h.tick(min(2)); const s = await g.status(); expect(s.state).toBe('locked'); expect(s.state === 'locked' && s.message).toMatch(/[\u0590-\u05FF]/);
    h.set(doc(3, [])); h.tick(min(3)); expect((await g.status()).state).toBe('active');
  });
  it('outage: keeps working within 6h grace, locks after; a seen block persists through an outage', async () => {
    const h = staticHost(); const g = guardOn(h);
    await g.status(); h.down(true);
    h.tick(min(5 * 60)); expect((await g.status()).state).toBe('active');
    h.tick(min(70)); expect(await g.status()).toMatchObject({ state: 'locked', reason: 'offline_too_long', message: OFFLINE_MESSAGE });
    h.down(false); h.tick(min(3)); expect((await g.status()).state).toBe('active');
    h.set(doc(2, [{ lid: license.lid, state: 'revoked_permanent' }])); h.tick(min(3)); expect((await g.status()).state).toBe('locked');
    h.down(true); h.tick(min(60)); expect((await g.status()).state).toBe('locked');
  });
  it('temporary block auto-expires on its date, even offline', async () => {
    const h = staticHost(); const g = guardOn(h);
    h.set(doc(2, [{ lid: license.lid, state: 'suspended_until', until: new Date(T0 + min(30)).toISOString() }])); h.tick(min(3));
    expect((await g.status()).state).toBe('locked');
    h.tick(min(31)); expect((await g.status()).state).toBe('active');
  });
  it('rollback to an older signed file and forged files are rejected', async () => {
    const h = staticHost(); const g = guardOn(h);
    h.set(doc(5, [{ lid: license.lid, state: 'revoked_permanent' }])); h.tick(min(3)); expect((await g.status()).state).toBe('locked');
    h.set(doc(4, [])); h.tick(min(3)); expect((await g.status()).state).toBe('locked'); // replay of an older "unblocked" file
    const forged = doc(9, []); forged.list.entries = []; forged.sig = doc(9, [{ lid: 'x', state: 'revoked_permanent' }]).sig;
    h.set(forged); h.tick(min(3)); expect((await g.status()).state).toBe('locked');
  });
  it('public file only accepts reason codes, never free text', () => {
    expect(() => doc(1, [{ lid: 'a', state: 'revoked_permanent', reason: 'שם הלקוח' as never }])).toThrow();
  });
  it('cloudflare static adapter: short cache header, no account calls by itself; shards', async () => {
    const put = vi.fn(async () => {});
    const r = await cloudflareStaticPublisher({ put, publicBaseUrl: 'https://static.example/' }).publish(doc(1, []));
    expect(r).toMatchObject({ ok: true, url: 'https://static.example/license-status.json' });
    expect(put).toHaveBeenCalledWith('license-status.json', expect.any(String), { contentType: 'application/json', cacheControl: 'public, max-age=60' });
    expect(shardKey('license-status.json', 'nurawell')).toBe('license-status.nurawell.json');
  });
});

describe('hub block / unblock', () => {
  function store(): LicenseStore {
    const rev = new Map<string, RevocationEntry>(); let v = 0;
    return { saveLicense: async () => {}, getLicense: async (lid) => (lid === license.lid ? license : null), list: async () => [],
      setRevocation: async (lid, e) => { rev.set(lid, { lid, state: e.state, ...(e.until ? { until: e.until } : {}), ...(e.reasonCode ? { reason: e.reasonCode } : {}) }); },
      clearRevocation: async (lid) => { rev.delete(lid); }, revocations: async () => [...rev.values()], bumpVersion: async () => ++v };
  }
  it('block → signed file published with reason code; audited without PII; unblock is one call', async () => {
    const pub = memoryRevocationPublisher(); const audit = vi.fn(async () => {});
    const d: Deps = { registry: [], root: '/', gate: async () => ({ ok: true, actorId: 'a1' }), audit, privatePem: K.privatePem, store: store(), publisher: pub, encrypt: async () => 'enc:v2:x' };
    expect((await licenseAction(d, { op: 'revoke', lid: license.lid, state: 'suspended_until_payment', reason: 'לא שולם', reasonCode: 'unpaid' })).status).toBe(200);
    expect(pub.current()!.list).toMatchObject({ version: 1, entries: [{ lid: license.lid, state: 'suspended_until_payment', reason: 'unpaid' }] });
    expect(audit).toHaveBeenCalledWith('license_blocked', 'm', expect.objectContaining({ reasonCode: 'unpaid' }));
    expect(JSON.stringify(audit.mock.calls)).not.toContain('לא שולם');
    expect((await licenseAction(d, { op: 'reinstate', lid: license.lid })).status).toBe(200);
    expect(pub.current()!.list).toMatchObject({ version: 2, entries: [] });
    expect(audit).toHaveBeenCalledWith('license_unblocked', 'm', { lid: license.lid });
  });
});

describe('optional shared Worker (sensitive server-side logic only)', () => {
  it('signed status push: seq must increase (replay/rollback rejected); runs a server-side core only when unblocked', async () => {
    const V = generateSigningKeyPair(); const st = memoryStatusStore();
    const handler = createVerifierHandler({ licensePublicKeyPem: K.publicPem, verifierPrivateKeyPem: V.privatePem, storage: statusStorage(st), statusStore: st,
      modules: { m: { enabled: true, cores: { quote: (i) => ({ total: (i as { n: number }).n * 2 }) } } } });
    const push = localStatusPusher(st, K.publicPem);
    const blocked = await signStatusUpdate(K.privatePem, { lid: license.lid, state: 'revoked_permanent', seq: 2 });
    expect((await push.push(blocked)).ok).toBe(true);
    expect(await applyStatusUpdate(st, K.publicPem, blocked)).toEqual({ ok: false, error: 'stale_seq' });
    expect(await applyStatusUpdate(st, K.publicPem, await signStatusUpdate(K.privatePem, { lid: license.lid, state: 'active', seq: 1 }))).toEqual({ ok: false, error: 'stale_seq' });
    const f = (async (_u: string, init: RequestInit) => handler(new Request('https://w.example/verify', init))) as typeof fetch;
    const ask = () => checkOnline({ url: 'https://w.example/verify', verifierPublicKeyPem: V.publicPem, fetch: f }, { token, moduleId: 'm', version: '1.0.0', host: 'shop.example.com', core: { name: 'quote', input: { n: 21 } } });
    expect(await ask()).toMatchObject({ kind: 'verdict', verdict: { ok: false, reason: 'revoked' } });
    const r = await handler(new Request('https://w.example/status', { method: 'POST', body: JSON.stringify(await signStatusUpdate(K.privatePem, { lid: license.lid, state: 'active', seq: 3 })) }));
    expect(r.status).toBe(200);
    expect(await ask()).toMatchObject({ kind: 'verdict', verdict: { ok: true, core: { total: 42 } } });
  });
});
