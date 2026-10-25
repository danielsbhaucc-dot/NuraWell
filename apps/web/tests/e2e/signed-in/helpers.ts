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

/**
 * The ladder specs step the shared test account down and back up. An aborted run can leave it at the
 * floor, where "easier" correctly returns 409 at_floor. Bring the main task back to level 0 first.
 */
export async function resetLadder(page: Page) {
  for (let i = 0; i < 6; i++) {
    const plan = await (await page.request.get('/api/v1/tasks/plan')).json();
    const t = plan?.tasks?.[0];
    if (!t || t.currentLevel >= 0 || !t.canStepUp) return;
    await page.request.post('/api/v1/tasks/level', { data: { assignmentId: t.id, direction: 'harder', reason: 'e2e reset' } });
  }
}

/** The health-data consent sheet can open over /plans for the test account; close it (no consent given). */
export async function closeConsentSheet(page: Page) {
  const sheet = page.getByTestId('consent-evidence-sheet');
  // the sheet opens a few seconds after navigation for an account without health consent; wait for it, never consent
  await sheet.waitFor({ state: 'visible', timeout: 6_000 }).catch(() => {});
  if (await sheet.isVisible().catch(() => false)) {
    await page.keyboard.press('Escape');
    if (await sheet.isVisible().catch(() => false)) {
      await page.getByRole('button', { name: 'סגירה' }).last().click({ force: true }).catch(() => {});
    }
    await sheet.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
  }
}
