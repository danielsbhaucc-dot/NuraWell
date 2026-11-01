import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }));
vi.mock('@/lib/platform/authorize', () => ({ loadModuleStates: async () => [], centralModuleSource: () => null }));

import { hiddenPathsFor, noticeProductsFor } from '@/lib/platform/nav-state';
import { FOUNDER_ROLE, ALL_PRODUCTS } from '@platform/iam';
import { MODULES } from '@/lib/platform/catalog';

describe('ops menu hides absent modules', () => {
  it('hides nothing when module state is unknown (fail open; server gate still 404s)', () => {
    expect(hiddenPathsFor([])).toEqual([]);
  });
  it('hides the pages of a non-core module that is off, never a core module', () => {
    const states = MODULES.map((m) => ({ moduleId: m.id, enabled: m.id !== 'gideon' }));
    const hidden = hiddenPathsFor(states as never);
    expect(hidden).toContain('/ops/ceo');
    expect(hidden).not.toContain('/ops/users');
    const all = hiddenPathsFor(MODULES.map((m) => ({ moduleId: m.id, enabled: false })) as never);
    for (const m of MODULES.filter((x) => x.core)) for (const p of m.pages ?? []) expect(all).not.toContain(p);
  });
  it('module toggles require a fresh single-use device approval', () => {
    const src = readFileSync(join(__dirname, '../app/api/v1/ops/iam/modules/route.ts'), 'utf8');
    expect(src).toContain('hasToggleApproval');
    expect(src).not.toContain('hasSensitiveStepUp');
  });
});

const g = (roleId: string, productId: string) => ({ id: roleId, userId: 'u1', roleId, productId, expiresAt: null, revokedAt: null });
const actor = (...grants: ReturnType<typeof g>[]) => ({ userId: 'u1', kind: 'human' as const, grants });
const ALERTING = new Set(['nurawell', 'sample']);

describe('off / expired modules', () => {
  it('turning a module off only flips the flag: no rows deleted, so re-entitlement restores everything', () => {
    const src = readFileSync(join(__dirname, '../lib/platform/iam-admin.ts'), 'utf8');
    expect(src).toContain(".from('iam_product_modules').upsert(");
    expect(src).not.toMatch(/\.delete\(/);
  });
});

describe('license/billing notices', () => {
  it('platform.founder sees every product\'s notice', () => {
    expect(noticeProductsFor(actor(g(FOUNDER_ROLE, ALL_PRODUCTS)) as never, ALERTING).map((n) => n.productId)).toEqual(['nurawell', 'sample']);
  });
  it('a product admin sees only their product', () => {
    expect(noticeProductsFor(actor(g('sample.admin', 'sample')) as never, ALERTING).map((n) => n.productId)).toEqual(['sample']);
    expect(noticeProductsFor(actor(g('sample.owner', 'sample')) as never, ALERTING).map((n) => n.productId)).toEqual(['sample']);
  });
  it('regular users and non-billing roles see nothing', () => {
    expect(noticeProductsFor(actor() as never, ALERTING)).toEqual([]);
    expect(noticeProductsFor(actor(g('sample.content', 'sample')) as never, ALERTING)).toEqual([]);
    expect(noticeProductsFor({ userId: 'b', kind: 'bot', grants: [] } as never, ALERTING)).toEqual([]);
  });
  it('no alert => no notice, even for the founder', () => {
    expect(noticeProductsFor(actor(g(FOUNDER_ROLE, ALL_PRODUCTS)) as never, new Set())).toEqual([]);
  });
});
