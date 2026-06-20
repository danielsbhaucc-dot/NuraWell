import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] as const;

type A11yPageCase = {
  name: string;
  path: string;
  /** ממתין ל-selector לפני סריקה */
  ready?: string;
  /** דף שדורש auth — מצפים להפניה ל-login */
  expectRedirectToLogin?: boolean;
};

const PUBLIC_PAGES: A11yPageCase[] = [
  { name: 'דף נחיתה', path: '/', ready: 'main, [role="main"], h1' },
  { name: 'התחברות', path: '/login', ready: 'main, [role="main"], form, h1' },
  { name: 'הצהרת נגישות', path: '/accessibility', ready: 'main, [role="main"], h1' },
];

async function analyzePage(page: import('@playwright/test').Page, label: string) {
  const results = await new AxeBuilder({ page })
    .withTags([...WCAG_TAGS])
    .exclude('.a11y-widget-root')
    .analyze();

  const critical = results.violations.filter((v) => v.impact === 'critical');
  const serious = results.violations.filter((v) => v.impact === 'serious');

  if (critical.length > 0 || serious.length > 0) {
    const summary = [...critical, ...serious]
      .map((v) => `${v.id} (${v.impact}): ${v.help} — ${v.nodes.length} nodes`)
      .join('\n');
    expect.soft(critical, `[${label}] critical axe violations`).toEqual([]);
    expect.soft(serious, `[${label}] serious axe violations:\n${summary}`).toEqual([]);
  }

  return results;
}

for (const pageCase of PUBLIC_PAGES) {
  test(`axe — ${pageCase.name} (${pageCase.path})`, async ({ page }) => {
    await page.goto(pageCase.path, { waitUntil: 'domcontentloaded' });
    if (pageCase.ready) {
      await page.locator(pageCase.ready).first().waitFor({ state: 'visible', timeout: 20_000 });
    }
    await analyzePage(page, pageCase.path);
  });
}

test('axe — /home מפנה ל-login (דף ציבורי נגיש)', async ({ page }) => {
  await page.goto('/home', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/login/);
  await page.locator('main, [role="main"], form, h1').first().waitFor({ state: 'visible', timeout: 20_000 });
  await analyzePage(page, '/home → /login');
});

test('axe — skip link קיים בדף נחיתה', async ({ page }) => {
  await page.goto('/');
  const skip = page.getByRole('link', { name: /דלג לתוכן/i });
  await expect(skip).toBeAttached();
});
