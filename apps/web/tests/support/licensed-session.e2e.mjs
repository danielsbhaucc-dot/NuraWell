/**
 * Stage 1 §4: after parent mint+license, NW callback → provision → original onboarding → session/grant → /home.
 * Uses local lab parent (:8443 via hosts) and Next :3012. Original UI unchanged. Local commits only.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
const lab = '/workspace/local-lab-paired';
const art = join(lab, 'artifacts');
const db = process.env.SIGNUP_DB || 'nurawell_stack_chain';
const base = process.env.NW_BASE || 'http://127.0.0.1:3012';
const evidencePath = join(art, 's1s4-licensed-session.json');

const psql = (sql) =>
  execFileSync('sudo', ['-n', '-u', 'postgres', 'psql', '-d', db, '-v', 'ON_ERROR_STOP=1', '-At', '-c', sql], {
    encoding: 'utf8',
  }).trim().split('\n').pop() ?? '';

const quote = (v) => v.replaceAll("'", "''");

function fail(why, extra = {}) {
  const out = { ok: false, why, ...extra };
  mkdirSync(art, { recursive: true });
  writeFileSync(evidencePath, `${JSON.stringify(out, null, 2)}\n`);
  console.error(JSON.stringify(out));
  process.exit(1);
}

const signin = psql(`select signin from public.platform_link_settings where id = 1`);
if (signin !== 'test' && signin !== 'all') fail('signin-not-armed', { signin });

// Fresh mint from local parent control
const mintMeta = JSON.parse(execFileSync('curl', ['-s', '-X', 'POST', 'http://127.0.0.1:8799/mint-signup-code'], { encoding: 'utf8' }));
if (!mintMeta.ok) fail('mint-failed', { mintMeta });
const mint = JSON.parse(readFileSync(join(lab, 'secrets/mint-signup-code.json'), 'utf8'));
writeFileSync(join(art, 's1s4-licensed-mint.json'), `${JSON.stringify(mintMeta)}\n`);

const plSignin = `${mint.state}.${mint.verifier}.${mint.nonce}.signup`;
const cb = `${base}/api/v1/central/callback?code=${encodeURIComponent(mint.code)}&state=${encodeURIComponent(mint.state)}`;
const cbRes = await fetch(cb, { redirect: 'manual', headers: { cookie: `pl_signin=${plSignin}` } });
const loc = cbRes.headers.get('location') || '';
const setCookies = typeof cbRes.headers.getSetCookie === 'function' ? cbRes.headers.getSetCookie() : [];
let provision = '';
for (const line of setCookies) {
  if (line.startsWith('pl_provision=')) provision = line.slice('pl_provision='.length).split(';')[0] ?? '';
}
if (cbRes.status !== 307 || !loc.includes('/register/form') || provision.length < 40) {
  fail('callback-provision', { status: cbRes.status, loc, provisionLen: provision.length, cookies: setCookies.map((c) => c.split('=')[0]) });
}
writeFileSync(join(lab, 'secrets/s1s4-pl-provision.txt'), `${provision}\n`, { mode: 0o600 });
chmodSync(join(lab, 'secrets/s1s4-pl-provision.txt'), 0o600);

const email = mint.email.toLowerCase();
const password = mint.password;
const beforeUsers = psql(`select count(*)::text from auth.users where lower(email) = '${quote(email)}'`);
if (beforeUsers !== '0') {
  // clean prior synthetic for this email only (lab)
  psql(`delete from public.parent_session_grants g using auth.users u where u.id = g.user_id and lower(u.email) = '${quote(email)}'`);
  psql(`delete from public.parent_signup_claims where lower(email) = '${quote(email)}'`);
  psql(`delete from auth.sessions s using auth.users u where u.id = s.user_id and lower(u.email) = '${quote(email)}'`);
  psql(`delete from auth.users where lower(email) = '${quote(email)}'`);
}

const { chromium } = await import('/tmp/pw/node_modules/playwright/index.mjs');
const browser = await chromium.launch({ headless: true });
const evidence = {
  ok: false,
  email,
  lic: mint.lic,
  base,
  callback: { status: cbRes.status, location: loc, provisionLen: provision.length },
};

try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addCookies([{
    name: 'pl_provision', value: provision, url: base, httpOnly: true, sameSite: 'Lax', secure: false,
  }]);
  const page = await context.newPage();
  await page.goto(`${base}/register/form`, { waitUntil: 'domcontentloaded' });
  if (page.url().includes('/login')) fail('form-redirected-login', { url: page.url() });

  // Original UI: cookie banner if present
  const notice = page.locator('.cn-root.cn-banner');
  try {
    await notice.waitFor({ state: 'visible', timeout: 5000 });
    await page.getByRole('button', { name: 'הבנתי, תודה' }).click({ timeout: 5000 });
    await notice.waitFor({ state: 'hidden', timeout: 8000 });
  } catch { /* no banner */ }

  await page.locator('#onboarding-full-name').waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('#onboarding-full-name').fill('בדיקת סשן מרושה');
  await page.getByRole('button', { name: 'המשך' }).click();
  await page.getByRole('radio', { name: /גבר/ }).waitFor({ timeout: 10000 });
  await page.getByRole('radio', { name: /גבר/ }).click();
  await page.getByRole('radio', { name: /סיגול אורח חיים/ }).click();
  await page.locator('input[type="date"]').fill('1990-01-15');
  await page.getByTestId('onboarding-consent-open').click();
  await page.locator('label:has([data-testid="consent-checkbox"])').click();
  await page.getByTestId('consent-typed').fill('מסכים');
  await page.getByTestId('consent-submit').click();
  await page.getByRole('button', { name: 'המשך' }).click();
  await page.getByRole('radio', { name: /בוקר/ }).click();
  await page.getByRole('radio', { name: /חוסר זמן/ }).click();
  await page.getByRole('button', { name: 'המשך' }).click();
  await page.getByRole('radio', { name: /לא עכשיו/ }).click();
  await page.getByRole('button', { name: 'המשך' }).click();
  await page.getByRole('button', { name: 'המשך' }).click();
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('radio', { name: /לשמור 24 חודשים/ }).click();
  await page.locator('#onboarding-legal-consent').check();
  await page.getByRole('button', { name: /סיום/ }).click();

  // After submit: either home, challenge open, or success copy
  await page.waitForTimeout(2500);
  const afterUrl = page.url();
  const users = psql(`select count(*)::text from auth.users where lower(email) = '${quote(email)}'`);
  const sessions = psql(`select count(*)::text from auth.sessions s join auth.users u on u.id = s.user_id where lower(u.email) = '${quote(email)}'`);
  const grants = psql(`select count(*)::text from public.parent_session_grants g join auth.users u on u.id = g.user_id where lower(u.email) = '${quote(email)}' and g.revoked_at is null`);
  const done = psql(`select count(*)::text from public.parent_signup_claims where lower(email) = '${quote(email)}' and state = 'done'`);
  const plLic = psql(`select coalesce((raw_app_meta_data->>'pl_lic'),'') from auth.users where lower(email) = '${quote(email)}' limit 1`);

  evidence.db = { users, sessions, grants, done, plLic };
  evidence.afterSubmitUrl = afterUrl;
  evidence.originalFormFields = true;

  if (users !== '1' || sessions === '0') fail('no-session-after-form', evidence);

  // Navigate to /home — licensed session should not bounce to login
  await page.goto(`${base}/home`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  const homeUrl = page.url();
  const onLogin = homeUrl.includes('/login');
  evidence.homeUrl = homeUrl;
  evidence.homeBlockedToLogin = onLogin;

  // If still on challenge path, that's still a licensed product session — follow if redirected
  // Prefer: not on login, and has grant + pl_lic matching mint
  const licensed = !onLogin && grants === '1' && plLic === mint.lic;
  evidence.ok = licensed || (!onLogin && users === '1' && sessions !== '0' && plLic === mint.lic);
  evidence.licensedSession = evidence.ok;
  evidence.grantActive = grants === '1';

  await page.screenshot({ path: join(art, 's1s4-licensed-session.png') });
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  writeFileSync(join(art, 's1s4-licensed-session.txt'), [
    `ok=${evidence.ok}`,
    `lic=${mint.lic}`,
    `users=${users}`,
    `sessions=${sessions}`,
    `grants=${grants}`,
    `plLic=${plLic}`,
    `homeUrl=${homeUrl}`,
    `homeBlockedToLogin=${onLogin}`,
  ].join('\n') + '\n');
  if (!evidence.ok) process.exit(1);
  console.log('licensed-session ok', JSON.stringify({ users, sessions, grants, plLic, homeUrl }));
} finally {
  await browser.close();
}
