import { expect, test } from '@playwright/test';
import { expectHealthy, hasCreds, login } from './helpers';

/**
 * Main flow: login → home → journey → plan with a seeded main task →
 * "קשה לי" (step down via ladder) → "קל לי" (back up) → progress.
 * Requires e2e/seed.sql to have been applied for the role=test account.
 */
test.describe.serial('main flow', () => {
  test.skip(!hasCreds(), 'E2E_TEST_EMAIL/E2E_TEST_PASSWORD not set');

  test('login → journey → plan → ladder down/up → progress', async ({ page }) => {
    await login(page);
    await page.goto('/home');
    await expectHealthy(page);

    await page.goto('/journey');
    await expectHealthy(page);
    await expect(page.getByText('פתיחה: מעקב ועוגנים').first()).toBeVisible();

    // unknown lesson → real 404 (not a soft 200)
    const missing = await page.goto('/journey/00000000-0000-0000-0000-000000000000');
    expect(missing?.status()).toBe(404);

    await page.goto('/plans');
    await expectHealthy(page);
    await expect(page.getByRole('heading', { name: 'התוכנית של נועה' })).toBeVisible();
    const ladder = page.getByRole('list', { name: 'סולם הקושי' }).first();
    await expect(ladder).toBeVisible();

    await page.getByRole('button', { name: 'קשה לי', exact: true }).first().click();
    await page.getByRole('button', { name: 'אישור' }).click();
    await expect(page.getByRole('button', { name: 'גם זה קשה לי' }).first()).toBeVisible({ timeout: 20_000 });

    await page.getByRole('button', { name: 'קל לי' }).first().click();
    await page.getByRole('button', { name: 'אישור' }).click();
    await expect(page.getByRole('button', { name: 'קשה לי', exact: true }).first()).toBeVisible({ timeout: 20_000 });

    await page.goto('/progress');
    await expectHealthy(page);
  });
});
