import { expect, test } from '@playwright/test';
import { expectHealthy, hasCreds, login, resetLadder, resetLadderToZero, closeConsentSheet, confirmLevel } from './helpers';

/**
 * Main flow: login → home → journey → plan with a seeded main task →
 * "קשה לי" (step down via ladder) → "קל לי" (back up) → progress.
 * Requires e2e/seed.sql to have been applied for the role=test account.
 */
test.describe.serial('main flow', () => {
  test.skip(!hasCreds(), 'E2E_TEST_EMAIL/E2E_TEST_PASSWORD not set');

  test('login → journey → plan → ladder down/up → progress', async ({ page }) => {
    await login(page);
    await resetLadder(page);
    await resetLadderToZero(page);
    await page.goto('/home');
    await expectHealthy(page);

    await page.goto('/journey');
    await expectHealthy(page);
    await expect(page.getByText('פתיחה: מעקב ועוגנים').first()).toBeVisible();

    // unknown content URLs → real 404 status
    for (const url of ['/journey/00000000-0000-0000-0000-000000000000', '/journey/99999', '/journey/xyz', '/guides/00000000-0000-0000-0000-000000000000', '/lessons/00000000-0000-0000-0000-000000000000']) {
      const res = await page.goto(url);
      expect(res?.status(), url).toBe(404);
    }
    // existing lesson still opens
    const ok = await page.goto('/journey/a1b2c3d4-e5f6-7890-abcd-ef1234567890');
    expect(ok?.status()).toBe(200);

    await page.goto('/plans');
    await expectHealthy(page);
    await expect(page.getByRole('heading', { name: 'התוכנית של נועה' })).toBeVisible();
    const ladder = page.getByRole('list', { name: 'סולם הקושי' }).first();
    // the bar renders only when the habit has >1 ladder levels (data-dependent); the buttons below are the real check
    console.log('EVIDENCE ladder bar visible:', await ladder.isVisible());
    await closeConsentSheet(page);

    await page.getByRole('button', { name: 'קשה לי', exact: true }).first().click();
    await confirmLevel(page, 'easier');
    await expect(page.getByRole('button', { name: 'גם זה קשה לי' }).first()).toBeVisible({ timeout: 20_000 });

    await closeConsentSheet(page);
    await page.getByRole('button', { name: 'קל לי' }).first().click();
    await confirmLevel(page, 'harder');
    await expect(page.getByRole('button', { name: 'קשה לי', exact: true }).first()).toBeVisible({ timeout: 20_000 });

    await page.goto('/progress');
    await expectHealthy(page);
  });
});
