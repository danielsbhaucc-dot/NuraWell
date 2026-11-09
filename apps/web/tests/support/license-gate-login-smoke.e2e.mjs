import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
const base = (process.env.BASE || 'http://127.0.0.1:3012').replace(/\/$/, '');
const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ locale: 'he-IL', viewport: { width: 390, height: 844 } })).newPage();
const paths = ['/home', '/journey', '/settings'];
const results = [];
try {
  for (const path of paths) {
    await page.goto(`${base}${path}`, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(400);
    const url = page.url();
    const onLogin = url.includes('/login');
    let email = false;
    if (onLogin) {
      email = (await page.locator('#login-email').count()) > 0;
    }
    results.push({ path, finalUrl: url, onLogin, originalEmailField: email });
  }
  const ok = results.every((r) => r.onLogin && r.originalEmailField);
  const out = { ok, note: 'unauthenticated protected paths → original login; not license-usage vitest', results };
  writeFileSync('/workspace/local-lab-paired/artifacts/s1s4-license-login-smoke.json', JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out));
  process.exit(ok ? 0 : 2);
} finally {
  await browser.close();
}
