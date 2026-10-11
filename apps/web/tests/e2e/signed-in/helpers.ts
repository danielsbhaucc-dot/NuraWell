import { expect, type Page } from '@playwright/test';

export const hasCreds = () => Boolean(process.env.E2E_TEST_EMAIL && process.env.E2E_TEST_PASSWORD);

export async function login(page: Page) {
  await page.goto('/login');
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
