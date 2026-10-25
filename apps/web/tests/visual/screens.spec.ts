import { expect, test } from '@playwright/test';
import { COOKIE_NOTICE_STORAGE_KEY, COOKIE_NOTICE_VERSION } from '../../lib/legal/cookie-inventory';

// Landing = canonical reference; every other screen must stay in its visual family.
const SCREENS: Array<{ name: string; path: string; settleMs?: number }> = [
  { name: 'landing', path: '/', settleMs: 7000 },
  { name: 'login', path: '/login' },
  { name: 'register', path: '/register' },
  { name: 'not-found', path: '/__visual-404__' },
];

for (const s of SCREENS) {
  test(`visual: ${s.name}`, async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-10-25T10:00:00+02:00'));
    await page.addInitScript(([k, v]) => window.localStorage.setItem(k, v), [COOKIE_NOTICE_STORAGE_KEY, COOKIE_NOTICE_VERSION] as const);
    await page.goto(s.path, { waitUntil: 'networkidle' });
    await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important}' });
    await page.waitForTimeout(s.settleMs ?? 1200);
    await expect(page).toHaveScreenshot(`${s.name}.png`, { fullPage: false, mask: [page.locator('video, iframe, [data-visual-mask]')] });
  });
}
