import { describe, it, expect, vi } from 'vitest';
import path from 'node:path';
import { generateKeyPairSync } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { REGISTRY } from '../../../packages/@platform/module-library-ui/src/server/hub-data';
import { readModuleFiles, sharePackage, sellPackage, SECRET_PATTERNS } from '../../../packages/@platform/module-library-ui/src/server/pack';
import { untar } from '../../../packages/@platform/module-library-ui/src/server/tar';
import { packageAction, licenseAction, registryLocked, type Deps } from '../../../packages/@platform/module-library-ui/src/server/actions';

const root = path.resolve(__dirname, '../../..');
const shareable = REGISTRY.find((m) => m.distribution === 'shareable')!;
const internal = REGISTRY.find((m) => m.distribution === 'internal');
const pem = generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const deps = (o: Partial<Deps> = {}): Deps => ({ registry: REGISTRY, root, gate: async () => ({ ok: true, actorId: 'a1' }), audit: vi.fn(async () => {}), privatePem: null, store: null, publisher: null, encrypt: async (_r, v) => `enc:v2:${v.length}`, ...o });

describe('share package', () => {
  it('contains module files + INTEGRITY.json and no secrets', () => {
    const files = readModuleFiles(root, shareable);
    expect(typeof files).not.toBe('string');
    const r = sharePackage(files as never, shareable);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const out = untar(gunzipSync(r.bytes));
    const names = out.map((f) => f.path);
    const prefix = `${shareable.id}-${shareable.version}/`;
    for (const n of ['module.json', 'README.he.md', 'llms.txt', 'INTEGRITY.json']) expect(names).toContain(prefix + n);
    expect(names.some((n) => /\.env|\.pem$|\.key$/.test(n))).toBe(false);
    for (const f of out) for (const re of SECRET_PATTERNS) expect(re.test(f.content.toString('utf8'))).toBe(false);
    const integ = JSON.parse(out.find((f) => f.path.endsWith('INTEGRITY.json'))!.content.toString());
    expect(integ.root).toMatch(/^[0-9a-f]{64}$/);
  });
  it('blocks secret-looking content and denied paths', () => {
    const m = { ...shareable, files: ['x.ts'] };
    expect(sharePackage([{ path: 'x.ts', content: 'ok' }], m).ok).toBe(true);
    expect(SECRET_PATTERNS.some((r) => r.test('-----BEGIN PRIVATE KEY-----'))).toBe(true);
    expect(readModuleFiles(root, { ...shareable, files: ['.env.local'] })).toMatch(/נחסם/);
  });
  it('internal modules never leave', () => {
    if (internal) expect(sharePackage([], internal)).toEqual({ ok: false, error: expect.stringMatching(/פנימי/) });
  });
});

describe('sell package', () => {
  const sellable = { ...shareable, distribution: 'sellable' as const, sale: { modes: ['bundle' as const] } };
  it('no key → Hebrew error, nothing issued', async () => {
    const r = await packageAction(deps(), { kind: 'sell', moduleId: shareable.id, licenseeRef: 'acme', domains: ['a.com'] });
    expect(r.status).toBe(503);
    expect(String(r.body.error)).toMatch(/מפתח החתימה/);
  });
  it('signed bundle with license token, public key, terms; no private key inside', async () => {
    const files = readModuleFiles(root, shareable) as { path: string; content: string }[];
    const r = await sellPackage(files, sellable, { privatePem: pem, licensee: { id: 'acme', name: 'acme' }, domains: ['a.com'], validDays: 30, mode: 'bundle' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const out = untar(gunzipSync(r.bytes));
    const names = out.map((f) => f.path.split('/').slice(1).join('/'));
    for (const n of ['LICENSE.token', 'license-public-key.pem', 'LICENSE-TERMS.he.md', 'BUNDLE-MANIFEST.json', 'INTEGRITY.json']) expect(names).toContain(n);
    expect(out.some((f) => /PRIVATE KEY/.test(f.content.toString()))).toBe(false);
    expect(r.expiresAt).toBeTruthy();
    expect(await sellPackage(files, sellable, { privatePem: pem, licensee: { id: 'acme', name: 'acme' }, domains: [], validDays: 30, mode: 'source' })).toMatchObject({ ok: false });
  });
});

describe('gates', () => {
  it('denied gate stops package and license actions before any work', async () => {
    const audit = vi.fn(async () => {});
    const d = deps({ gate: async () => ({ ok: false, status: 403, error: 'אין הרשאה' }), audit });
    expect((await packageAction(d, { kind: 'share', moduleId: shareable.id })).status).toBe(403);
    expect((await licenseAction(d, { op: 'list' })).status).toBe(403);
    expect(audit).not.toHaveBeenCalled();
  });
  it('license actions without store → Hebrew 503', async () => {
    const r = await licenseAction(deps({ privatePem: pem }), { op: 'list' });
    expect(r.status).toBe(503);
  });
  it('registry alwaysOn modules cannot be switched off server-side', () => {
    const locked = REGISTRY.find((m) => !m.toggleable && m.store.iamModule);
    if (locked) { expect(registryLocked(REGISTRY, locked.store.iamModule!, false)).toBe(true); expect(registryLocked(REGISTRY, locked.store.iamModule!, true)).toBe(false); }
    const free = REGISTRY.find((m) => m.toggleable && m.store.iamModule);
    if (free) expect(registryLocked(REGISTRY, free.store.iamModule!, false)).toBe(false);
  });
  it('audit detail carries no licensee name (PII)', async () => {
    const audit = vi.fn(async () => {});
    await packageAction(deps({ audit }), { kind: 'share', moduleId: shareable.id, licenseeName: 'ישראל ישראלי' });
    expect(JSON.stringify(audit.mock.calls)).not.toContain('ישראל');
  });
});
