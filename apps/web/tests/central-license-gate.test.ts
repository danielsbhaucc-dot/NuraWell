import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => { throw new Error('no db in tests'); } }));
import { decideGate, licenseGate, purchaseUrl, PURCHASE_URL_DEFAULT, type Settings } from '@/lib/central/license-gate';

const on: Settings = { mode: 'enforce', scope: 'all' };
const v = (reason: string) => ({ allow: reason === 'active', wouldBlock: reason !== 'active', reason, mode: 'enforce' }) as never;
const u = (meta: Record<string, unknown> = {}) => ({ id: 'x', app_metadata: meta });

describe('license gate decision', () => {
  it('blocks nobody unless env AND DB both say enforce (kill switch)', () => {
    expect(decideGate(undefined, on, u(), 'user', v('no_license'))).toMatchObject({ block: false, why: 'off' });
    expect(decideGate('shadow', on, u(), 'user', v('no_license'))).toMatchObject({ block: false, why: 'off' });
    expect(decideGate('enforce', { mode: 'shadow', scope: 'all' }, u(), 'user', v('no_license'))).toMatchObject({ block: false, why: 'off' });
    expect(decideGate('enforce', null, u(), 'user', v('no_license'))).toMatchObject({ block: false, why: 'off' });
  });
  it('never blocks an admin', () => {
    expect(decideGate('enforce', on, u(), 'admin', v('no_license'))).toMatchObject({ block: false, why: 'admin' });
  });
  it("scope 'test' only touches flagged test identities", () => {
    const t: Settings = { mode: 'enforce', scope: 'test' };
    expect(decideGate('enforce', t, u(), 'user', v('no_license'))).toMatchObject({ block: false, why: 'out_of_scope' });
    expect(decideGate('enforce', t, u({ pl_enforce_test: 'true' }), 'user', v('no_license'))).toMatchObject({ block: false });
    expect(decideGate('enforce', t, u({ pl_enforce_test: true }), 'test', v('no_license'))).toMatchObject({ block: true, why: 'unlicensed' });
  });
  it('fails open on parent outage (no status / stale beyond grace / error)', async () => {
    expect(decideGate('enforce', on, u(), 'user', v('no_status'))).toMatchObject({ block: false, why: 'outage' });
    expect(decideGate('enforce', on, u(), 'user', v('stale_status'))).toMatchObject({ block: false, why: 'outage' });
    expect(decideGate('enforce', on, u(), 'user', null)).toMatchObject({ block: false, why: 'outage' });
    await expect(decideGate('enforce', on, u(), 'user', () => Promise.reject(new Error('x')))).resolves.toMatchObject({ block: false, why: 'outage' });
  });
  it('allows active, blocks unlicensed/revoked/suspended/expired/unknown/wrong product', () => {
    expect(decideGate('enforce', on, u(), 'user', v('active'))).toMatchObject({ block: false, why: 'licensed' });
    for (const r of ['no_license', 'unknown_license', 'revoked', 'suspended', 'expired', 'wrong_product'])
      expect(decideGate('enforce', on, u(), 'user', v(r))).toMatchObject({ block: true, reason: r });
  });
  it('runtime gate is off without env and fails open when the DB is unreachable', async () => {
    await expect(licenseGate(u(), 'user', {})).resolves.toMatchObject({ block: false, why: 'off' });
    await expect(licenseGate(u({ pl_enforce_test: true }), 'user', { PLATFORM_LICENSE_MODE: 'enforce' })).resolves.toMatchObject({ block: false });
  });
  it('purchase URL: https only, safe default', () => {
    expect(purchaseUrl({})).toBe(PURCHASE_URL_DEFAULT);
    expect(purchaseUrl({ PLATFORM_PURCHASE_URL: 'javascript:alert(1)' })).toBe(PURCHASE_URL_DEFAULT);
    expect(purchaseUrl({ PLATFORM_PURCHASE_URL: 'https://shop.example.com/buy' })).toBe('https://shop.example.com/buy');
  });
  it('block screen: Hebrew RTL, no native dialogs; gate wired into dashboard + Almog chat', () => {
    const ui = readFileSync('components/license/LicenseRequired.tsx', 'utf8');
    expect(ui).toMatch(/dir="rtl"/);
    expect(ui).not.toMatch(/\b(alert|confirm|prompt)\(/);
    expect(readFileSync('app/(dashboard)/layout.tsx', 'utf8')).toMatch(/redirect\('\/license-required'\)/);
    expect(readFileSync('app/api/v1/ai/chat/route.ts', 'utf8')).toMatch(/license_required/);
    expect(readFileSync('app/license-required/page.tsx', 'utf8')).toMatch(/if \(!gate\.block\) redirect/);
  });
});
