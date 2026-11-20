import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';

vi.mock('server-only', () => ({}));
const state = vi.hoisted(() => ({ role: 'user' as string | null, reason: 'active', calls: [] as string[] }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => { throw new Error('no db in tests'); } }));
vi.mock('../lib/central/license-gate', () => ({
  profileRole: async () => state.role,
  licenseReasonFor: async (lic: string) => { state.calls.push(lic); return state.reason; },
  purchaseUrl: (env: Record<string, string | undefined>) => env.PLATFORM_PURCHASE_URL ?? null,
}));

import { buildSubscriptionView, manageUrlFrom, stateFromReason } from '../lib/central/my-subscription';
import { loadMySubscription } from '../lib/central/my-subscription-server';
import { ParentSubscriptionView } from '../components/billing/ParentSubscriptionView';

const BUY = 'https://platform-core-preview.vercel.app/products/nurawell/';

describe('parent-licensed "my subscription"', () => {
  beforeEach(() => { state.role = 'user'; state.reason = 'active'; state.calls = []; });

  it('maps every license reason to a verified state, never inventing one', () => {
    const o = { hasLicense: true, isStaff: false };
    expect(stateFromReason('active', o)).toBe('active');
    expect(stateFromReason('expired', o)).toBe('expired');
    expect(stateFromReason('suspended', o)).toBe('suspended');
    expect(stateFromReason('revoked', o)).toBe('revoked');
    expect(stateFromReason('wrong_product', o)).toBe('revoked');
    expect(stateFromReason('unknown_license', o)).toBe('none');
    expect(stateFromReason('no_license', o)).toBe('none');
    expect(stateFromReason('no_status', o)).toBe('unknown');
    expect(stateFromReason('stale_status', o)).toBe('unknown');
    expect(stateFromReason(null, { hasLicense: false, isStaff: false })).toBe('none');
    expect(stateFromReason('expired', { hasLicense: true, isStaff: true })).toBe('staff');
  });

  it('manage link is the parent account area on the purchase origin; bad URLs are dropped', () => {
    expect(manageUrlFrom(BUY)).toBe('https://platform-core-preview.vercel.app/account/area/');
    expect(manageUrlFrom('http://evil.example/')).toBeNull();
    expect(manageUrlFrom('javascript:alert(1)')).toBeNull();
    expect(manageUrlFrom(null)).toBeNull();
  });

  it('offers a purchase link only when there is no live subscription', () => {
    expect(buildSubscriptionView({ reason: 'active', hasLicense: true, isStaff: false, purchaseUrl: BUY }).buyUrl).toBeNull();
    expect(buildSubscriptionView({ reason: null, hasLicense: false, isStaff: false, purchaseUrl: BUY }).buyUrl).toBe(BUY);
    expect(buildSubscriptionView({ reason: 'expired', hasLicense: true, isStaff: false, purchaseUrl: BUY }).buyUrl).toBe(BUY);
    expect(buildSubscriptionView({ reason: 'no_status', hasLicense: true, isStaff: false, purchaseUrl: BUY }).buyUrl).toBeNull();
    const staff = buildSubscriptionView({ reason: null, hasLicense: false, isStaff: true, purchaseUrl: BUY });
    expect(staff).toMatchObject({ state: 'staff', tone: 'ok', manageUrl: null, buyUrl: null });
  });

  it('server loader reads only the server-written license id and never calls the parent without one', async () => {
    const env = { PLATFORM_PURCHASE_URL: BUY };
    expect((await loadMySubscription({ id: 'u1', app_metadata: { pl_lic: 'lic_abc123' } }, env)).state).toBe('active');
    expect(state.calls).toEqual(['lic_abc123']);
    expect((await loadMySubscription({ id: 'u1', app_metadata: { pl_lic: 'bad id; drop' } }, env)).state).toBe('none');
    expect((await loadMySubscription({ id: 'u1', app_metadata: {} }, env)).state).toBe('none');
    expect(state.calls).toEqual(['lic_abc123']);
    state.role = 'admin';
    expect((await loadMySubscription({ id: 'u1', app_metadata: {} }, env)).state).toBe('staff');
  });

  it('renders every state in Hebrew RTL with the right links and no white', () => {
    for (const [reason, hasLicense, expectBuy] of [['active', true, false], [null, false, true], ['expired', true, true], ['suspended', true, false], ['no_status', true, false]] as const) {
      const view = buildSubscriptionView({ reason, hasLicense, isStaff: false, purchaseUrl: BUY });
      const html = renderToStaticMarkup(createElement(ParentSubscriptionView, { view }));
      expect(html).toContain('dir="rtl"');
      expect(html).toContain(`data-state="${view.state}"`);
      expect(html).toContain('href="https://platform-core-preview.vercel.app/account/area/"');
      expect(html.includes('data-testid="my-subscription-buy"')).toBe(expectBuy);
      expect(html).not.toMatch(/#fff\b|#ffffff|bg-white|text-white|rgb\(255,\s*255,\s*255\)/i);
    }
  });

  it('page keeps the local billing screen when that platform is on, and the settings drawer links here', () => {
    const page = readFileSync(new URL('../app/(dashboard)/settings/subscription/page.tsx', import.meta.url), 'utf8');
    expect(page).toMatch(/billingPlatformEnabled\(\)\) return <MySubscriptionClient/);
    expect(page).not.toMatch(/notFound\(/);
    const drawer = readFileSync(new URL('../components/profile/ProfileSettingsDrawer.tsx', import.meta.url), 'utf8');
    expect(drawer).toContain("href: '/settings/subscription'");
    expect(drawer).toContain("href: '/contact'");
  });
});
