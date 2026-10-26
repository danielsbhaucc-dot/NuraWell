import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  generateSigningKeyPair, loadSigningKey, issueLicense, renewLicense, verifyLicense, satisfies, hostMatches,
  signRevocationList, verifyRevocationList, revocationFor, buildBundle, verifyBundle, encodeWatermark, extractWatermark,
  createLicenseGuard, fileRevocationPublisher, type RevocationList,
} from '../../../packages/@platform/licensing/src';
import { createVerifierHandler, memoryStorage, toHost, checkOnline } from '../../../packages/@platform/licensing/src/online';

const K = generateSigningKeyPair();
const V = generateSigningKeyPair(); // separate verifier key
const T0 = new Date('2026-10-01T00:00:00Z');
const day = (n: number) => new Date(T0.getTime() + n * 86_400_000);
const lic = (o: Partial<Parameters<typeof issueLicense>[1]> = {}) => issueLicense(K.privatePem, { moduleId: 'm', versionRange: '^1.0.0', licensee: { id: 'c1', name: 'c1' }, domains: ['shop.example.com'], mode: 'bundle', ...o }, T0);
const ctx = (o: Record<string, unknown> = {}) => ({ moduleId: 'm', version: '1.2.0', host: 'shop.example.com', now: day(1), ...o });

describe('license', () => {
  it('missing or wrong key → null (feature disabled)', () => {
    expect(loadSigningKey(undefined)).toBeNull();
    expect(loadSigningKey('not a key')).toBeNull();
  });
  it('valid, default 30 days', () => {
    const { token, license } = lic();
    expect(Date.parse(license.expiresAt!) - T0.getTime()).toBe(30 * 86_400_000);
    expect(verifyLicense(token, K.publicPem, ctx()).ok).toBe(true);
  });
  it('expiry', () => { expect(verifyLicense(lic().token, K.publicPem, ctx({ now: day(31) }))).toMatchObject({ ok: false, reason: 'expired' }); });
  it('domain mismatch + wildcard', () => {
    expect(verifyLicense(lic().token, K.publicPem, ctx({ host: 'evil.com' }))).toMatchObject({ reason: 'domain_mismatch' });
    expect(hostMatches('a.example.com', '*.example.com')).toBe(true);
    expect(hostMatches('a.b.example.com', '*.example.com')).toBe(false);
  });
  it('tampered license', () => {
    const [p, body, sig] = lic().token.split('.');
    const j = JSON.parse(Buffer.from(body, 'base64url').toString()); j.domains = ['evil.com'];
    const forged = `${p}.${Buffer.from(JSON.stringify(j)).toString('base64url')}.${sig}`;
    expect(verifyLicense(forged, K.publicPem, ctx({ host: 'evil.com' }))).toMatchObject({ reason: 'bad_signature' });
    expect(verifyLicense(lic().token, generateSigningKeyPair().publicPem, ctx())).toMatchObject({ reason: 'bad_signature' });
  });
  it('version range + wrong module', () => {
    expect(satisfies('2.0.0', '^1.0.0')).toBe(false);
    expect(satisfies('1.5.0', '>=1.0.0 <2.0.0')).toBe(true);
    expect(verifyLicense(lic().token, K.publicPem, ctx({ version: '2.0.0' }))).toMatchObject({ reason: 'version_out_of_range' });
    expect(verifyLicense(lic().token, K.publicPem, ctx({ moduleId: 'x' }))).toMatchObject({ reason: 'wrong_module' });
  });
  it('renew keeps lid, new window', () => {
    const { license } = lic();
    const r = renewLicense(K.privatePem, license, 30, day(29));
    expect(r.license.lid).toBe(license.lid);
    expect(verifyLicense(r.token, K.publicPem, ctx({ now: day(45) })).ok).toBe(true);
  });
  it('bundle needs expiry and domain', () => { expect(() => lic({ domains: [] })).toThrow(); });
});

describe('revocation list', () => {
  const { license } = lic();
  const list = (version: number, entries: RevocationList['entries']) => signRevocationList(K.privatePem, { version, issuedAt: T0.toISOString(), entries });
  it('three states; suspended_until lifts after date', () => {
    const l = verifyRevocationList(list(1, [{ lid: 'a', state: 'suspended_until', until: day(5).toISOString() }, { lid: 'b', state: 'suspended_until_payment' }, { lid: 'c', state: 'revoked_permanent' }]), K.publicPem)!;
    expect(revocationFor(l, 'a', day(1))?.state).toBe('suspended_until');
    expect(revocationFor(l, 'a', day(6))).toBeNull();
    expect(revocationFor(l, 'b', day(99))?.state).toBe('suspended_until_payment');
    expect(revocationFor(l, 'c', day(99))?.state).toBe('revoked_permanent');
  });
  it('tampered list rejected', () => {
    const d = list(1, [{ lid: license.lid, state: 'revoked_permanent' }]);
    d.list.entries = [];
    expect(verifyRevocationList(d, K.publicPem)).toBeNull();
  });
  it('file publisher writes a verifiable doc', async () => {
    const p = join(mkdtempSync(join(tmpdir(), 'rev-')), 'revocations.json');
    const r = await fileRevocationPublisher(p, async (f, s) => writeFileSync(f, s)).publish(list(3, []));
    expect(r.ok).toBe(true);
    expect(verifyRevocationList(JSON.parse(readFileSync(p, 'utf8')), K.publicPem)?.version).toBe(3);
  });
});

describe('guard (buyer side)', () => {
  const { token, license } = lic();
  const base = { moduleId: 'm', version: '1.2.0', publicKeyPem: K.publicPem, licenseToken: token, host: 'shop.example.com', revocationUrl: 'https://static.example/rev.json', now: () => day(1) };
  const doc = (version: number, revoked: boolean) => signRevocationList(K.privatePem, { version, issuedAt: T0.toISOString(), entries: revoked ? [{ lid: license.lid, state: 'revoked_permanent' }] : [] });

  it('revoked → locked with Hebrew message; host survives', async () => {
    const g = createLicenseGuard({ ...base, fetch: async () => doc(2, true) });
    const s = await g.status();
    expect(s).toMatchObject({ state: 'locked', reason: 'revoked' });
    expect(s.state === 'locked' && s.message).toMatch(/נעול/);
    expect(await g.run(() => 'real', () => 'fallback')).toBe('fallback');
  });
  it('rollback to older list rejected', async () => {
    let serve = doc(5, true);
    const g = createLicenseGuard({ ...base, pollHours: 1, fetch: async () => serve });
    expect((await g.status()).state).toBe('locked');
    serve = doc(4, false); // attacker replays an older, clean list
    await g.refresh(true);
    expect((await g.status()).state).toBe('locked');
  });
  it('unreachable list → keeps working until expiry (offline grace)', async () => {
    let t = day(1);
    const g = createLicenseGuard({ ...base, now: () => t, fetch: async () => { throw new Error('down'); } });
    expect((await g.status()).state).toBe('active');
    t = day(31);
    expect(await g.status()).toMatchObject({ state: 'locked', reason: 'expired' });
  });
  it('tampered list ignored, garbage token never throws', async () => {
    const bad = doc(9, true); bad.list.entries = [];
    expect((await createLicenseGuard({ ...base, fetch: async () => bad }).status()).state).toBe('active');
    const g = createLicenseGuard({ ...base, licenseToken: '💥', fetch: async () => null });
    await expect(g.status()).resolves.toMatchObject({ state: 'locked' });
    await expect(g.run(() => { throw new Error('never runs'); }, () => 'ok')).resolves.toBe('ok');
  });
  it('integrity failure locks', async () => {
    expect(await createLicenseGuard({ ...base, integrityOk: false }).status()).toMatchObject({ reason: 'tampered' });
  });
});

describe('bundle', () => {
  it('watermark round-trip and is invisible', () => {
    const w = encodeWatermark('buyer-42');
    expect(w.replace(/[\u200b-\u200d\u2060\ufeff]/g, '')).toBe('');
    expect(extractWatermark(`x${w}y`)).toBe('buyer-42');
  });
  it('signed manifest; tamper / missing / extra file detected; watermark extractable', async () => {
    const b = await buildBundle(K.privatePem, { moduleId: 'm', version: '1.0.0', lid: 'L1', licenseeId: 'buyer-42', files: [{ path: 'index.js', content: 'export const a=1;' }, { path: 'README.he.md', content: 'קרא' }], transform: (c) => c.replace(/\s+/g, '') });
    const fs = new Map(b.files.map((f) => [f.path, f.content]));
    const read = (p: string) => fs.get(p) ?? null;
    expect(verifyBundle(K.publicPem, b.manifest, b.signature, read)).toEqual({ ok: true });
    expect(extractWatermark(fs.get('index.js')!)).toBeTruthy();
    fs.set('index.js', fs.get('index.js') + 'evil()');
    expect(verifyBundle(K.publicPem, b.manifest, b.signature, read)).toMatchObject({ ok: false, reason: 'tampered' });
    fs.delete('index.js');
    expect(verifyBundle(K.publicPem, b.manifest, b.signature, read)).toMatchObject({ reason: 'missing_file' });
    expect(verifyBundle(K.publicPem, b.manifest, b.signature, (p) => b.files.find((f) => f.path === p)?.content ?? null, [...b.files.map((f) => f.path), 'x.js'])).toMatchObject({ reason: 'extra_file' });
    expect(verifyBundle(K.publicPem, { ...b.manifest, watermark: 'zzz' }, b.signature, read)).toMatchObject({ reason: 'bad_signature' });
  });
});

describe('online verifier (portable, optional)', () => {
  const now = new Date();
  const { token, license } = issueLicense(K.privatePem, { moduleId: 'm', versionRange: '^1.0.0', licensee: { id: 'c', name: 'c' }, domains: ['shop.example.com'], mode: 'bundle' }, now);
  const storage = memoryStorage();
  const handler = createVerifierHandler({ licensePublicKeyPem: K.publicPem, verifierPrivateKeyPem: V.privatePem, storage, modules: { m: { enabled: true, cores: { echo: (i) => ({ echoed: i }) } } } });
  const local = (h: (r: Request) => Promise<Response>) => (async (url: string | URL | Request, init?: RequestInit) => h(new Request(String(url), init))) as typeof fetch;
  const online = { enabled: true, url: 'https://verifier.test/verify', verifierPublicKeyPem: V.publicPem, fetch: local(handler), cacheSeconds: 0 };
  const guard = (o = {}) => createLicenseGuard({ moduleId: 'm', version: '1.0.0', publicKeyPem: K.publicPem, licenseToken: token, host: 'shop.example.com', online: { ...online, ...o } });

  it('only Web-standard APIs in the online entry', () => {
    const dir = join(__dirname, '../../../packages/@platform/licensing/src/online');
    for (const f of ['handler.ts', 'storage.ts', 'client.ts', 'webcrypto.ts', 'protocol.ts']) expect(readFileSync(join(dir, f), 'utf8')).not.toMatch(/from ['"](node:|crypto['"]|fs|http)|Buffer\.|process\./);
    for (const f of ['../canonical.ts', '../match.ts', '../semver.ts']) expect(readFileSync(join(dir, f), 'utf8')).not.toMatch(/node:|Buffer|process\./);
  });
  it('active, then instant revocation', async () => {
    expect((await guard().status()).state).toBe('active');
    storage.set({ lid: license.lid, state: 'suspended_until_payment' });
    expect(await guard().status()).toMatchObject({ state: 'locked', reason: 'suspended' });
    storage.set({ lid: license.lid, state: 'suspended_until', until: new Date(now.getTime() - 1000).toISOString() });
    expect((await guard().status()).state).toBe('active');
  });
  it('domain binding at the verifier', async () => {
    const r = await checkOnline(online, { token, moduleId: 'm', version: '1.0.0', host: 'other.com' });
    expect(r).toMatchObject({ kind: 'verdict', verdict: { ok: false, reason: 'domain_mismatch' } });
    expect(storage.seen.get(license.lid)?.has('shop.example.com')).toBe(true);
  });
  it('unreachable or forged verifier → offline fallback', async () => {
    expect((await guard({ fetch: (async () => { throw new Error('down'); }) as typeof fetch }).status()).state).toBe('active');
    const evil = createVerifierHandler({ licensePublicKeyPem: K.publicPem, verifierPrivateKeyPem: generateSigningKeyPair().privatePem, storage: memoryStorage([{ lid: license.lid, state: 'revoked_permanent' }]), modules: { m: { enabled: true } } });
    expect((await guard({ fetch: local(evil) }).status()).state).toBe('active');
  });
  it('server-core call only for a valid license', async () => {
    storage.set({ lid: license.lid, state: 'suspended_until', until: new Date(0).toISOString() });
    expect(await guard().callCore('echo', 7)).toEqual({ echoed: 7 });
    storage.set({ lid: license.lid, state: 'revoked_permanent' });
    expect(await guard().callCore('echo', 7)).toBeNull();
  });
  it('same handler on every host; node adapter serves it', async () => {
    expect(typeof toHost('cloudflare', handler).fetch).toBe('function');
    expect(toHost('vercel', handler)).toBe(handler);
    const srv = await toHost('node', handler).listen(0);
    try {
      const r = await fetch(`http://127.0.0.1:${srv.port}/health`);
      expect(await r.json()).toEqual({ ok: true });
    } finally { srv.close(); }
  });
});
