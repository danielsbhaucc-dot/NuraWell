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

/**
 * Click the ladder confirm button and wait for the level API to answer, so the next step never races a
 * stale dialog or an in-flight request. Fails with the server's reason if the change was refused.
 */
export async function confirmLevel(page: Page, direction: 'easier' | 'harder') {
  const resP = page.waitForResponse(
    (r) => r.url().includes('/api/v1/tasks/level') && r.request().method() === 'POST',
    { timeout: 30_000 },
  );
  const dialogBtn = page.getByRole('button', { name: 'אישור' });
  await dialogBtn.click();
  const res = await resP;
  const body = await res.json().catch(() => ({}));
  expect(res.status(), `level ${direction}: ${JSON.stringify(body)}`).toBe(200);
  await expect(dialogBtn).toHaveCount(0, { timeout: 10_000 });
}

/**
 * Deterministic start state for the shared role=test account: main task back at level 0 (both directions),
 * so every spec starts from the same ladder position regardless of the previous spec or an aborted run.
 */
export async function resetLadderToZero(page: Page) {
  for (let i = 0; i < 8; i++) {
    const plan = await (await page.request.get('/api/v1/tasks/plan')).json();
    const t = plan?.tasks?.[0];
    if (!t || t.currentLevel === 0) return;
    const direction = t.currentLevel < 0 ? 'harder' : 'easier';
    await page.request.post('/api/v1/tasks/level', { data: { assignmentId: t.id, direction, reason: 'e2e reset' } });
  }
}
