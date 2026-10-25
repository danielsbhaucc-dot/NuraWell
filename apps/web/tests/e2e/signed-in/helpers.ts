import { expect, type Page } from '@playwright/test';

export const hasCreds = () => Boolean(process.env.E2E_TEST_EMAIL && process.env.E2E_TEST_PASSWORD);

export async function login(page: Page) {
  await page.goto('/login');
  await dismissCookieNotice(page);
  await page.getByPlaceholder('your@email.com').fill(process.env.E2E_TEST_EMAIL!);
  await page.getByPlaceholder('••••••').fill(process.env.E2E_TEST_PASSWORD!);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30_000 });
}

export async function expectHealthy(page: Page) {
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByText('משהו השתבש')).toHaveCount(0);
  await expect(page.getByText('This page could not be found')).toHaveCount(0);
}

/** The cookie notice overlays the login form on first visit; accept it (or remove it) before interacting. */
export async function dismissCookieNotice(page: Page) {
  const notice = page.locator('.cn-root');
  try {
    await notice.first().waitFor({ state: 'visible', timeout: 8_000 });
  } catch {
    return;
  }
  const btn = notice.getByRole('button').first();
  if (await btn.count()) await btn.click({ timeout: 5_000 }).catch(() => {});
  await notice.first().waitFor({ state: 'hidden', timeout: 5_000 }).catch(async () => {
    await page.evaluate(() => document.querySelectorAll('.cn-root').forEach((e) => e.remove()));
  });
}
