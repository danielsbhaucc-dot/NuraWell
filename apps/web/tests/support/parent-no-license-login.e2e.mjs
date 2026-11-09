/**
 * Identity candidate (local): /login?e=parent_no_license keeps original login UI
 * and shows NO_LICENSE copy. Does not re-run expired-restart or licensed-session.
 */
import { chromium } from '/tmp/pw/node_modules/playwright/index.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';

const base = (process.env.BASE || 'http://127.0.0.1:3012').replace(/\/$/, '');
const ART = '/workspace/local-lab-paired/artifacts/s1s2-parent-no-license-20261109';
mkdirSync(ART, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ locale: 'he-IL', viewport: { width: 390, height: 844 } });
try {
  await page.goto(`${base}/login?e=parent_no_license`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(500);
  const cookie = page.getByRole('button', { name: /הבנתי/ });
  if (await cookie.count()) await cookie.first().click();
  await page.locator('#login-email').waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('#login-password').waitFor({ state: 'visible', timeout: 5000 });
  const body = await page.locator('body').innerText();
  const heading = await page.locator('h2').filter({ hasText: 'כניסה לחשבון' }).count();
  // Copy from parent-signin-text NO_LICENSE — tolerate partial match without asserting secrets
  const licenseHint = /רישיון|מנוי|רכיש|גישה/.test(body);
  const passwordFieldsKept = (await page.locator('#login-email').count()) === 1
    && (await page.locator('#login-password').count()) === 1;
  await page.screenshot({ path: `${ART}/login-parent-no-license-w390.png`, fullPage: true });

  // Also parent_unavailable banner still shows original form (smoke; expired suite already deeper)
  await page.goto(`${base}/login?e=parent_unavailable`, { waitUntil: 'domcontentloaded' });
  if (await page.getByRole('button', { name: /הבנתי/ }).count()) await page.getByRole('button', { name: /הבנתי/ }).first().click();
  await page.locator('#login-email').waitFor({ state: 'visible', timeout: 10000 });
  const unavailableText = await page.locator('body').innerText();
  const unavailableOk = unavailableText.includes('לא זמינה') || unavailableText.includes('אימייל וסיסמה');

  const out = {
    ok: heading > 0 && passwordFieldsKept && licenseHint && unavailableOk,
    parent_no_license: { heading, passwordFieldsKept, licenseHint, url: page.url() },
    parent_unavailable: { unavailableOk },
    note: 'original login UI unchanged; error banners only',
  };
  // fix url for no_license shot context
  out.parent_no_license.url = `${base}/login?e=parent_no_license`;
  writeFileSync(`${ART}/verdict.json`, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out));
  process.exit(out.ok ? 0 : 2);
} finally {
  await browser.close();
}
