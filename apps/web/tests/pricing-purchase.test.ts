import { describe, it, expect, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';

vi.mock('server-only', () => ({}));
import { PLANS, TRIAL, purchaseHref, trialEnabled, PURCHASE_PLAN_CODE, planIdFromCode } from '../lib/billing/plans';
import { startTrial } from '../lib/billing/service';
import { PlansGrid } from '../components/billing/PlansGrid';
import { fallbackPricing } from '../lib/billing/plans';

const BASE = 'https://platform-core-preview.vercel.app/products/nurawell/';

describe('/pricing sells all three plans through the parent purchase page', () => {
  it('all three plans are on sale (no plan-level "coming soon") at 179 / 199 / 449', () => {
    expect(PLANS.map((p) => [p.id, p.monthlyIls, p.comingSoon ?? false])).toEqual([['basic', 179, false], ['whatsapp', 199, false], ['premium', 449, false]]);
  });

  it('links carry exactly plan=basic|whatsapp|phone (agreed parent contract), round-trip with the DB codes', () => {
    expect(purchaseHref(BASE, 'basic')).toBe(`${BASE}?plan=basic`);
    expect(purchaseHref(BASE, 'whatsapp')).toBe(`${BASE}?plan=whatsapp`);
    expect(purchaseHref(BASE, 'premium')).toBe(`${BASE}?plan=phone`);
    for (const p of PLANS) expect(planIdFromCode(PURCHASE_PLAN_CODE[p.id])).toBe(p.id);
    expect(purchaseHref('http://insecure.example/', 'basic')).toBeNull();
    expect(purchaseHref('javascript:alert(1)', 'basic')).toBeNull();
    expect(purchaseHref(null, 'basic')).toBeNull();
  });

  it('renders a buy link per plan, no waitlist, no white, RTL-safe copy', () => {
    const html = renderToStaticMarkup(createElement(PlansGrid, { purchaseBase: BASE, pricing: fallbackPricing() }));
    expect(html.match(/data-testid="plan-buy"/g)?.length).toBe(3);
    for (const c of ['basic', 'whatsapp', 'phone']) expect(html).toContain(`href="${BASE}?plan=${c}"`);
    expect(html).not.toMatch(/רשימת המתנה|רשימת ההמתנה/);
    expect(html).not.toMatch(/#fff\b|#ffffff|bg-white|text-white/i);
    expect(html).not.toContain('data-testid="trial-line"');
  });

  it('active subscription → manage instead of a second purchase; no purchase URL → disabled, never a broken link', () => {
    const active = renderToStaticMarkup(createElement(PlansGrid, { purchaseBase: BASE, pricing: fallbackPricing(), hasActiveSubscription: true }));
    expect(active.match(/data-testid="plan-manage"/g)?.length).toBe(3);
    expect(active).not.toContain('plan-buy');
    const none = renderToStaticMarkup(createElement(PlansGrid, { purchaseBase: null, pricing: fallbackPricing() }));
    expect(none.match(/data-testid="plan-unavailable"/g)?.length).toBe(3);
    expect(none).not.toContain('href="null"');
  });
});

describe('free trial switch (off by default)', () => {
  it('is off now: nothing shown, no trial param, trial route refuses without touching the DB', async () => {
    expect(TRIAL.days).toBe(0);
    expect(trialEnabled()).toBe(false);
    expect(purchaseHref(BASE, 'basic')).not.toContain('trial=');
    const admin = { from: () => { throw new Error('must not touch the DB when the trial is off'); } };
    await expect(startTrial(admin as never, 'u1')).resolves.toEqual({ ok: false, reason: 'trial_disabled' });
  });

  it('turning it on later works end to end (link param + local trial row length)', async () => {
    expect(trialEnabled({ days: 14 })).toBe(true);
    expect(purchaseHref(BASE, 'whatsapp', { days: 14 })).toBe(`${BASE}?plan=whatsapp&trial=14`);
    const inserted: Record<string, unknown>[] = [];
    const admin = {
      from: (t: string) => ({
        insert: (row: Record<string, unknown>) => {
          inserted.push({ t, ...row });
          return { select: () => ({ single: async () => ({ data: { id: 's1', trial_ends_at: row.trial_ends_at }, error: null }) }) };
        },
      }),
    };
    const now = new Date('2026-11-20T10:00:00Z');
    const r = await startTrial(admin as never, 'u1', now, 14);
    expect(r).toEqual({ ok: true, trialEndsAt: '2026-12-04T10:00:00.000Z' });
    expect(inserted[1]).toMatchObject({ t: 'billing_events', kind: 'trial_started', metadata: { days: 14 } });
  });

  it('trial route maps the off switch to 404 and the trial length has one source', () => {
    expect(readFileSync(new URL('../app/api/v1/billing/trial/route.ts', import.meta.url), 'utf8')).toContain("'trial_disabled' ? 404");
    expect(readFileSync(new URL('../lib/billing/tiers.ts', import.meta.url), 'utf8')).toMatch(/TRIAL_DAYS = TRIAL\.days/);
  });
});

describe('license-required screen links to subscription management', () => {
  it('shows "manage" (parent account area) next to purchase, and hides it when not configured', async () => {
    const { default: LicenseRequired } = await import('../components/shared/LicenseRequired');
    const signOut = async () => {};
    const withManage = renderToStaticMarkup(createElement(LicenseRequired, { purchaseHref: BASE, manageHref: 'https://platform-core-preview.vercel.app/account/area/', signOut }));
    expect(withManage).toContain('data-testid="license-manage"');
    expect(withManage).toContain('href="https://platform-core-preview.vercel.app/account/area/"');
    const without = renderToStaticMarkup(createElement(LicenseRequired, { purchaseHref: null, signOut }));
    expect(without).not.toContain('license-manage');
    expect(readFileSync(new URL('../app/license-required/page.tsx', import.meta.url), 'utf8')).toMatch(/manageHref=\{manageUrlFrom\(buy\)\}/);
  });
});
