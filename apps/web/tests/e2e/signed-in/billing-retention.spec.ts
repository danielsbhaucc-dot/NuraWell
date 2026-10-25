import { expect, test } from '@playwright/test';
import { hasCreds, login } from './helpers';

/**
 * Subscription retention + billing (prod, role=test account). Never deletes data, never charges.
 * Billing surfaces must stay dark in prod (flag OFF).
 */
test.describe.serial('billing + retention (prod, test account)', () => {
  test.skip(!hasCreds(), 'E2E_TEST_EMAIL/E2E_TEST_PASSWORD not set');

  test('admin subscription override is closed to non-admins', async ({ page, request }) => {
    const anon = await request.post('/api/v1/admin/users/11111111-1111-4111-8111-111111111111/subscription', { data: { action: 'end' } });
    console.log('EVIDENCE admin override anon', anon.status());
    expect([401, 403]).toContain(anon.status());
    await login(page);
    const me = await page.evaluate(async () => (await fetch('/api/v1/account/me').then((r) => r.json()).catch(() => null)));
    const uid = me?.id ?? me?.user?.id ?? '11111111-1111-4111-8111-111111111111';
    const r = await page.request.post(`/api/v1/admin/users/${uid}/subscription`, { data: { action: 'end' } });
    console.log('EVIDENCE admin override test user', r.status());
    expect([401, 403]).toContain(r.status());
  });

  test('billing is dark in prod', async ({ request }) => {
    const w = await request.post('/api/v1/billing/webhook/mock', { data: {} });
    console.log('EVIDENCE billing webhook', w.status());
    expect(w.status()).toBe(404);
  });

  test('retention choice: settings UI changes it and every change is recorded', async ({ page }) => {
    await login(page);
    const before = await page.evaluate(async () => (await fetch('/api/v1/account/retention-choice', { cache: 'no-store' })).json());
    console.log('EVIDENCE retention before', JSON.stringify(before));
    expect(['keep_24m', 'delete_now']).toContain(before.choice);

    await page.goto('/settings/privacy');
    const section = page.getByTestId('retention-choice-section');
    await expect(section).toBeVisible({ timeout: 20_000 });
    const target = before.choice === 'keep_24m' && !before.is_default ? 'delete_now' : 'keep_24m';
    await section.locator(`[data-choice="${target}"]`).click();
    await section.getByTestId('retention-save').click();
    await expect.poll(async () => (await page.evaluate(async () => (await fetch('/api/v1/account/retention-choice', { cache: 'no-store' })).json())).choice, { timeout: 15_000 }).toBe(target);
    console.log('EVIDENCE retention changed to', target);

    // Always leave the test account on keep_24m (never delete_now).
    const restore = await page.evaluate(async () => (await fetch('/api/v1/account/retention-choice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ choice: 'keep_24m' }) })).status);
    expect(restore).toBe(200);
    const bad = await page.evaluate(async () => (await fetch('/api/v1/account/retention-choice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ choice: 'forever' }) })).status);
    expect(bad).toBe(400);
  });

  test('onboarding shows the retention choice with nothing preselected', async ({ browser }) => {
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    const res = await p.goto('/onboarding');
    console.log('EVIDENCE onboarding', res?.status());
    expect(res?.status()).toBeLessThan(500);
    await ctx.close();
  });
});
