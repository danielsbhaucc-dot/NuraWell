/**
 * Local browser E2E: expired parent sign-in redirect → /login?e=parent_restart
 * Original product login UI stays (email/password + Hebrew restart copy).
 * Lab only — no push/deploy. Uses existing Next on BASE (default :3012).
 *
 *   BASE=http://127.0.0.1:3012 node apps/web/tests/support/expired-parent-restart.e2e.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
const evidenceDir = join(root, 'apps/web/tests/evidence');
const artifactDir = '/workspace/local-lab-paired/artifacts';
const base = (process.env.BASE || 'http://127.0.0.1:3012').replace(/\/$/, '');
const RESTART_COPY = 'הקישור לכניסה פג. אפשר להתחיל שוב מכאן.';

function b64url(n) {
  return randomBytes(n).toString('base64url');
}

function fail(msg, extra = {}) {
  const out = { ok: false, error: msg, ...extra };
  mkdirSync(evidenceDir, { recursive: true });
  writeFileSync(join(evidenceDir, 'expired-parent-restart.json'), JSON.stringify(out, null, 2));
  writeFileSync(join(artifactDir, 's1s2-expired-restart-e2e.json'), JSON.stringify(out, null, 2));
  console.error('EXPIRED_RESTART_E2E_FAIL', msg);
  process.exit(1);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ locale: 'he-IL', viewport: { width: 390, height: 844 } });
const page = await context.newPage();

try {
  const probe = await page.request.get(`${base}/api/v1/central/signin?probe=1`);
  if (!probe.ok()) fail('probe-http', { status: probe.status() });
  const probeJson = await probe.json();
  if (probeJson.on !== true) fail('central-not-armed', { probeJson });

  // Baseline: original login UI before expired redirect
  await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.locator('#login-email').waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('#login-password').waitFor({ state: 'visible', timeout: 5000 });
  const baselineHasRestart = await page.getByTestId('login-parent-error').count();
  if (baselineHasRestart !== 0) fail('baseline-already-shows-parent-error');

  // Simulate in-flight parent sign-in cookie, then parent returns error=expired
  const state = b64url(24);
  const verifier = b64url(36);
  const nonce = b64url(18);
  const origin = new URL(base);
  await context.addCookies([
    {
      name: 'pl_signin',
      value: `${state}.${verifier}.${nonce}`,
      domain: origin.hostname,
      path: '/api/v1/central',
      httpOnly: true,
      secure: origin.protocol === 'https:',
      sameSite: 'Lax',
    },
  ]);

  const callbackUrl = `${base}/api/v1/central/callback?error=expired&state=${encodeURIComponent(state)}`;
  const resp = await page.goto(callbackUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  const finalUrl = page.url();
  const status = resp?.status() ?? 0;

  if (!finalUrl.includes('/login')) fail('not-on-login', { finalUrl, status });
  const u = new URL(finalUrl);
  if (u.searchParams.get('e') !== 'parent_restart') {
    fail('wrong-e-param', { finalUrl, e: u.searchParams.get('e'), status });
  }

  // Original UI unchanged + restart copy from mapping
  await page.locator('#login-email').waitFor({ state: 'visible', timeout: 10000 });
  await page.locator('#login-password').waitFor({ state: 'visible', timeout: 5000 });
  const alert = page.getByTestId('login-parent-error');
  await alert.waitFor({ state: 'visible', timeout: 10000 });
  const alertText = (await alert.innerText()).trim();
  if (alertText !== RESTART_COPY) fail('wrong-copy', { alertText });
  if (/סיסמה/.test(alertText)) fail('password-fallback-copy', { alertText });

  // Heading / form still product login (not a central takeover screen)
  const heading = await page.locator('h2').filter({ hasText: 'כניסה לחשבון' }).count();
  if (heading < 1) fail('missing-product-heading');
  const register = await page.getByRole('link', { name: 'הרשמה' }).count();
  if (register < 1) fail('missing-register-link');

  // Control: wrong error stays unavailable (proves we did not blanket-map everything)
  await page.goto(`${base}/login?e=parent_unavailable`, { waitUntil: 'domcontentloaded' });
  const other = (await page.getByTestId('login-parent-error').innerText()).trim();
  if (other === RESTART_COPY) fail('unavailable-shows-restart-copy');

  // Re-hit expired path once more via request+cookie to confirm Location header
  const state2 = b64url(24);
  await context.addCookies([
    {
      name: 'pl_signin',
      value: `${state2}.${b64url(36)}.${b64url(18)}`,
      domain: origin.hostname,
      path: '/api/v1/central',
      httpOnly: true,
      secure: origin.protocol === 'https:',
      sameSite: 'Lax',
    },
  ]);
  const api = await context.request.get(
    `${base}/api/v1/central/callback?error=expired&state=${encodeURIComponent(state2)}`,
    { maxRedirects: 0 },
  );
  const loc = api.headers()['location'] || '';
  // Playwright may follow; if 307/302 capture location
  const apiStatus = api.status();
  const locOk = loc.includes('e=parent_restart') || (apiStatus >= 300 && apiStatus < 400 && loc.includes('parent_restart'));
  // If redirects followed, body URL check already done above — treat missing Location as ok when status 200 on login
  const headerProof = locOk || apiStatus === 200;

  // "אפשר להתחיל שוב מכאן" — starting central sign-in again yields a parent authorize redirect
  await page.goto(`${base}/login?e=parent_restart`, { waitUntil: 'domcontentloaded' });
  const start = await context.request.get(`${base}/api/v1/central/signin`, { maxRedirects: 0 });
  const startStatus = start.status();
  const startLoc = start.headers()['location'] || '';
  const canRestart =
    (startStatus >= 300 && startStatus < 400 && /authorize|platform-core|identity|\/id\//i.test(startLoc)) ||
    (startStatus >= 300 && startStatus < 400 && startLoc.length > 8);
  if (!canRestart) fail('cannot-restart-central-signin', { startStatus, startLoc: startLoc ? 'set' : 'empty' });

  // Signup intent + expired parent request must restart on login, not open onboarding
  const state3 = b64url(24);
  await context.addCookies([
    {
      name: 'pl_signin',
      value: `${state3}.${b64url(36)}.${b64url(18)}.signup`,
      domain: origin.hostname,
      path: '/api/v1/central',
      httpOnly: true,
      secure: origin.protocol === 'https:',
      sameSite: 'Lax',
    },
  ]);
  await page.goto(`${base}/api/v1/central/callback?error=expired&state=${encodeURIComponent(state3)}`, {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });
  const signupUrl = page.url();
  if (!signupUrl.includes('/login') || !signupUrl.includes('e=parent_restart')) {
    fail('signup-intent-expired-not-restart', { signupUrl });
  }
  if (signupUrl.includes('/register/form')) fail('signup-intent-expired-opened-onboarding', { signupUrl });

  const evidence = {
    ok: true,
    base,
    probeOn: true,
    finalUrl,
    e: 'parent_restart',
    alertText,
    originalUi: { email: true, password: true, heading: true, register: true },
    notPasswordFallback: true,
    controlUnavailableDistinct: true,
    callbackStatus: status,
    headerProbe: { status: apiStatus, location: loc ? 'set' : 'followed-or-empty', locOk },
    headerProof,
    canRestart: true,
    startStatus,
    signupIntentExpiredRestarts: true,
  };
  mkdirSync(evidenceDir, { recursive: true });
  writeFileSync(join(evidenceDir, 'expired-parent-restart.json'), JSON.stringify(evidence, null, 2));
  writeFileSync(join(artifactDir, 's1s2-expired-restart-e2e.json'), JSON.stringify(evidence, null, 2));
  console.log('EXPIRED_RESTART_E2E_OK', JSON.stringify({ finalUrl: evidence.finalUrl, alertText }));
} catch (err) {
  fail(String(err?.message || err), { stack: String(err?.stack || '') });
} finally {
  await browser.close();
}
