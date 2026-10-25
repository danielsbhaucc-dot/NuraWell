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
});
