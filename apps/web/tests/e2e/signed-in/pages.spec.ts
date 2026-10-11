import { expect, test } from '@playwright/test';
import { expectHealthy, hasCreds, login } from './helpers';

const USER_PAGES = [
  '/home', '/journey', '/journey/declined', '/guides', '/plans', '/plans/details', '/progress', '/progress/history',
  '/profile', '/summaries', '/settings/almog', '/settings/privacy', '/settings/sos-moments',
];

test.describe('signed-in page pass (mobile RTL)', () => {
  test.skip(!hasCreds(), 'E2E_TEST_EMAIL/E2E_TEST_PASSWORD not set');
  test.beforeEach(async ({ page }) => login(page));
  for (const path of USER_PAGES) {
    test(`page ${path}`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      const res = await page.goto(path, { waitUntil: 'domcontentloaded' });
      expect(res?.status() ?? 0).toBeLessThan(400);
      await page.waitForLoadState('networkidle').catch(() => null);
      expect(new URL(page.url()).pathname).not.toMatch(/^\/login/);
      await expectHealthy(page);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, 'horizontal overflow on mobile').toBeLessThanOrEqual(2);
      expect(errors, 'uncaught page errors').toEqual([]);
      await page.screenshot({ path: `test-results/pages/${path.replace(/\//g, '_') || 'root'}.png`, fullPage: true });
    });
  }
});
