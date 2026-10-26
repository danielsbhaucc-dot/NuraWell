import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ALL_PRODUCTS, FOUNDER_ROLE, checkGrantChange, decide, defineCatalog, isModuleEnabled, permittedProducts, validateRegistry,
  type Actor, type Grant,
} from '@platform/iam';
import { CATALOG, MODULES } from '@/lib/platform/catalog';
import { permissionFor } from '@/lib/platform/route-permissions';

// A dummy second product registered with ZERO product-specific code: it must inherit everything.
const TWO = defineCatalog([
  { id: 'nurawell', name: 'NuraWell', status: 'active' },
  { id: 'invest', name: 'Invest', status: 'active' },
]);
const g = (userId: string, roleId: string, productId: string, extra: Partial<Grant> = {}): Grant => ({ userId, roleId, productId, expiresAt: null, revokedAt: null, ...extra });
const human = (userId: string, grants: Grant[]): Actor => ({ userId, kind: 'human', grants });
const founder = human('d', [g('d', FOUNDER_ROLE, ALL_PRODUCTS)]);
const nwAdmin = human('a', [g('a', 'nurawell.admin', 'nurawell')]);
const investOwner = human('o', [g('o', 'invest.owner', 'invest')]);

describe('decide: deny by default', () => {
  it('no grants → deny', () => expect(decide(TWO, human('x', []), 'nurawell', 'admin.access').allow).toBe(false));
  it('unknown product / permission → deny even for the founder', () => {
    expect(decide(TWO, founder, 'nope', 'admin.access')).toMatchObject({ allow: false, reason: 'unknown_product' });
    expect(decide(TWO, founder, 'nurawell', 'made.up')).toMatchObject({ allow: false, reason: 'unknown_permission' });
  });
  it('bots and services are never authorized, whatever they hold', () => {
    expect(decide(TWO, { ...founder, kind: 'bot' }, 'nurawell', 'admin.access').allow).toBe(false);
    expect(decide(TWO, { ...founder, kind: 'service' }, 'nurawell', 'admin.access').allow).toBe(false);
  });
  it('a grant belonging to another user is ignored', () => {
    expect(decide(TWO, human('x', [g('d', FOUNDER_ROLE, ALL_PRODUCTS)]), 'nurawell', 'admin.access').allow).toBe(false);
  });
});

describe('cross-product isolation', () => {
  it('NuraWell admin cannot touch the second product', () => {
    expect(decide(TWO, nwAdmin, 'nurawell', 'content.write').allow).toBe(true);
    expect(decide(TWO, nwAdmin, 'invest', 'admin.access')).toMatchObject({ allow: false, reason: 'no_grant' });
  });
  it('second product owner cannot read NuraWell (users, logs, exports)', () => {
    for (const p of ['admin.access', 'users.read', 'users.pii.read', 'data.export', 'logs.read', 'qc.read']) {
      expect(decide(TWO, investOwner, 'nurawell', p, { steppedUp: true }).allow).toBe(false);
    }
  });
  it('a product role used with the wildcard scope is ignored', () => {
    expect(decide(TWO, human('z', [g('z', 'nurawell.owner', ALL_PRODUCTS)]), 'nurawell', 'admin.access').allow).toBe(false);
  });
  it('switcher lists only permitted products; the founder sees all', () => {
    expect(permittedProducts(TWO, nwAdmin).map((p) => p.id)).toEqual(['nurawell']);
    expect(permittedProducts(TWO, investOwner).map((p) => p.id)).toEqual(['invest']);
    expect(permittedProducts(TWO, founder).map((p) => p.id)).toEqual(['nurawell', 'invest']);
  });
  it('the new product got the full security role set automatically', () => {
    expect(TWO.roles.map((r) => r.id)).toEqual(expect.arrayContaining(['invest.owner', 'invest.security', 'invest.viewer']));
    expect(TWO.sensitive).toEqual(expect.arrayContaining(['iam.grant', 'security.manage', 'data.export']));
  });
});

describe('step-up and just-in-time', () => {
  it('sensitive permissions require step-up even for the founder', () => {
    expect(decide(TWO, founder, 'nurawell', 'iam.grant')).toMatchObject({ allow: false, reason: 'step_up_required' });
    expect(decide(TWO, founder, 'nurawell', 'iam.grant', { steppedUp: true }).allow).toBe(true);
  });
  it('expired or revoked grants stop working on their own', () => {
    const now = Date.parse('2026-10-25T12:00:00Z');
    const a = human('s', [g('s', 'nurawell.security', 'nurawell', { expiresAt: '2026-10-25T11:59:59Z' })]);
    expect(decide(TWO, a, 'nurawell', 'security.read', { now }).allow).toBe(false);
    const b = human('s', [g('s', 'nurawell.admin', 'nurawell', { revokedAt: '2026-10-25T10:00:00Z' })]);
    expect(decide(TWO, b, 'nurawell', 'admin.access', { now }).allow).toBe(false);
  });
});

describe('anti-escalation', () => {
  const now = Date.parse('2026-10-25T12:00:00Z');
  const req = (o: Partial<Parameters<typeof checkGrantChange>[2]>) => ({ targetUserId: 't', roleId: 'nurawell.viewer', productId: 'nurawell', expiresAt: null, action: 'grant' as const, ...o });
  it('nobody grants to themselves', () => expect(checkGrantChange(TWO, founder, req({ targetUserId: 'd' }), { steppedUp: true, now })).toMatchObject({ ok: false, reason: 'self_change' }));
  it('without step-up nothing changes', () => expect(checkGrantChange(TWO, founder, req({}), { steppedUp: false, now })).toMatchObject({ ok: false }));
  it('owner roles are founder-only', () => {
    const nwOwner = human('w', [g('w', 'nurawell.owner', 'nurawell')]);
    expect(checkGrantChange(TWO, nwOwner, req({ roleId: 'nurawell.owner' }), { steppedUp: true, now })).toMatchObject({ ok: false, reason: 'founder_only' });
    expect(checkGrantChange(TWO, founder, req({ roleId: 'nurawell.owner' }), { steppedUp: true, now })).toMatchObject({ ok: true, ownerLevel: true });
  });
  it('the founder role itself can never be granted from the app', () => {
    expect(checkGrantChange(TWO, founder, req({ roleId: FOUNDER_ROLE, productId: ALL_PRODUCTS }), { steppedUp: true, now })).toMatchObject({ ok: false });
  });
  it('a non-founder admin without iam.grant cannot grant anything', () => {
    expect(checkGrantChange(TWO, nwAdmin, req({}), { steppedUp: true, now })).toMatchObject({ ok: false, reason: 'no_iam_grant' });
  });
  it('bots (Gideon) cannot change grants', () => {
    expect(checkGrantChange(TWO, { ...founder, kind: 'bot' }, req({}), { steppedUp: true, now })).toMatchObject({ ok: false, reason: 'not_human' });
  });
  it('time-limited roles need an expiry within the cap', () => {
    expect(checkGrantChange(TWO, founder, req({ roleId: 'nurawell.security' }), { steppedUp: true, now })).toMatchObject({ reason: 'expiry_required' });
    expect(checkGrantChange(TWO, founder, req({ roleId: 'nurawell.security', expiresAt: '2026-10-26T12:00:00Z' }), { steppedUp: true, now })).toMatchObject({ reason: 'expiry_out_of_range' });
    expect(checkGrantChange(TWO, founder, req({ roleId: 'nurawell.security', expiresAt: '2026-10-25T14:00:00Z' }), { steppedUp: true, now })).toMatchObject({ ok: true });
  });
});

describe('module registry', () => {
  it('registry is consistent', () => expect(validateRegistry(MODULES)).toEqual([]));
  it('core security modules are on for a brand-new product with zero rows', () => {
    for (const id of ['security-core', 'iam', 'audit-log', 'incident-response', 'alerts', 'field-encryption', 'logs']) {
      expect(isModuleEnabled(MODULES, [], 'invest', id)).toBe(true);
    }
    expect(isModuleEnabled(MODULES, [], 'invest', 'a11y')).toBe(false);
  });
  it('toggle is per product and respects dependencies', () => {
    const st = [{ productId: 'invest', moduleId: 'billing', enabled: true }];
    expect(isModuleEnabled(MODULES, st, 'invest', 'billing')).toBe(false); // privacy-retention off
    const st2 = [...st, { productId: 'invest', moduleId: 'privacy-retention', enabled: true }];
    expect(isModuleEnabled(MODULES, st2, 'invest', 'billing')).toBe(true);
    expect(isModuleEnabled(MODULES, st2, 'nurawell', 'billing')).toBe(false);
  });
});

describe('route → permission map', () => {
  it('unmapped admin routes need owner.actions (deny by default)', () => expect(permissionFor('/api/v1/admin/brand-new', 'GET')).toBe('owner.actions'));
  it('reads vs writes', () => {
    expect(permissionFor('/api/v1/admin/guides/abc', 'GET')).toBe('content.read');
    expect(permissionFor('/api/v1/admin/guides', 'POST')).toBe('content.write');
    expect(permissionFor('/api/v1/ops/legal/logs/export', 'GET')).toBe('data.export');
    expect(permissionFor('/api/v1/admin/users/8fd07d18-815e-47c5-9c79-fe7006ecef8b/subscription', 'POST')).toBe('billing.manage');
  });
  it('every mapped permission exists in the catalog', () => {
    for (const m of ['GET', 'POST']) for (const p of ['/api/v1/ops/iam', '/api/v1/admin/costs', '/api/v1/admin/notify-quality', '/api/v1/ops/security/recover']) {
      expect(CATALOG.permissions).toContain(permissionFor(p, m));
    }
  });
});

describe('migration seed mirrors the TS catalog', () => {
  const sql = readFileSync(path.resolve(__dirname, '../../../supabase/migrations/000191_platform_iam.sql'), 'utf8');
  const seed = sql.slice(sql.indexOf('-- IAM-SEED-BEGIN'), sql.indexOf('-- IAM-SEED-END'));
  it('same roles and permissions', () => {
    for (const role of CATALOG.roles) {
      expect(seed).toContain(`('${role.id}',`);
      for (const p of role.permissions) expect(seed).toContain(`('${role.id}', '${p}')`);
    }
    const pairs = [...seed.matchAll(/\('([a-z.]+)', '([a-z.*_]+)'\)/g)].map((m) => `${m[1]}|${m[2]}`);
    const ts = CATALOG.roles.flatMap((r) => r.permissions.map((p) => `${r.id}|${p}`));
    expect(new Set(pairs)).toEqual(new Set(ts));
  });
  it('same modules', () => {
    const mseed = sql.slice(sql.indexOf('-- MODULES-SEED-BEGIN'), sql.indexOf('-- MODULES-SEED-END'));
    for (const m of MODULES) expect(mseed).toMatch(new RegExp(`\\('${m.id}', '[^']+', ${m.core}, '\\{${m.dependsOn.join(',')}\\}'\\)`));
  });
});
