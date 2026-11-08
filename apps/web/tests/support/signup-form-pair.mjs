/**
 * Two-server onboarding form for a provision the parent machine already obtained.
 * This file does not mint a provision, a parent token, or a client secret.
 * A missing provision is exit 2. A GET of /register/form is not a result.
 *
 *   SIGNUP_PROVISION=... SIGNUP_EMAIL=person@example.test \
 *   SIGNUP_APP_A=http://127.0.0.1:3012 SIGNUP_APP_B=http://127.0.0.1:3013 \
 *   node apps/web/tests/support/signup-form-pair.mjs
 *
 * SIGNUP_DB defaults to nurawell_stack_chain. SIGNUP_PASSWORD is optional.
 */
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
const db = process.env.SIGNUP_DB || 'nurawell_stack_chain';
const evidencePath = join(root, 'apps/web/tests/evidence/signup-form-pair.json');
const provision = process.env.SIGNUP_PROVISION ?? '';
const email = (process.env.SIGNUP_EMAIL ?? '').trim().toLowerCase();
const appA = process.env.SIGNUP_APP_A ?? '';
const appB = process.env.SIGNUP_APP_B ?? '';

function psql(sql) {
  return execFileSync('sudo', ['-n', '-u', 'postgres', 'psql', '-d', db, '-v', 'ON_ERROR_STOP=1', '-At', '-c', sql], {
    encoding: 'utf8',
  }).trim().split('\n').pop() ?? '';
}

function stop(reason) {
  process.stdout.write(`signup-form-pair not-run ${reason}\n`);
  process.exit(2);
}

if (!provision) stop('provision-not-supplied');
if (!email || !appA || !appB) stop('email-or-servers-missing');
if (provision.length < 40 || provision.includes(' ') ) stop('provision-unusable');

const signin = psql(`select signin from public.platform_link_settings where id = 1`);
if (signin !== 'test' && signin !== 'all') stop('signin-not-armed');
const finish = psql(`select pg_get_function_identity_arguments(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'parent_signup_finish'`);
if (finish !== 'p_nonce text, p_attempt uuid, p_user uuid, p_session uuid') stop('claim-functions-are-not-000241');

const password = process.env.SIGNUP_PASSWORD || `Fence${randomBytes(9).toString('hex')}a1`;
const sentinelUser = randomUUID();
const sentinelSession = randomUUID();
const quote = (value) => value.replaceAll("'", "''");

function counts() {
  return {
    users: psql(`select count(*)::text from auth.users where lower(email) = '${quote(email)}'`),
    sessions: psql(`select count(*)::text from auth.sessions s join auth.users u on u.id = s.user_id where lower(u.email) = '${quote(email)}'`),
    grants: psql(`select count(*)::text from public.parent_session_grants g join auth.users u on u.id = g.user_id where lower(u.email) = '${quote(email)}' and g.revoked_at is null`),
    done: psql(`select count(*)::text from public.parent_signup_claims where lower(email) = '${quote(email)}' and state = 'done'`),
    sentinel: psql(`select count(*)::text from auth.sessions where id = '${sentinelSession}'`),
  };
}

async function acceptCookies(page) {
  // Lab-only: cookie notice overlays the first Continue control. Product UI unchanged.
  const btn = page.locator('.cn-root [data-testid="cookie-accept"], .cn-root button:has-text("אשר"), .cn-root button:has-text("הבנתי"), .cn-root button:has-text("אישור")').first();
  try {
    if (await btn.count()) await btn.click({ timeout: 2000 });
  } catch { /* already dismissed */ }
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('.cn-root, [aria-label="הודעה על עוגיות"]')) el.remove();
  }).catch(() => {});
}

async function fill(page, origin, accountEmail) {
  await page.goto(new URL('/register/form', origin).toString(), { waitUntil: 'domcontentloaded' });
  if (page.url().includes('/login') || page.url().includes('/api/v1/central/signin')) {
    throw new Error('form redirected before submit');
  }
  await acceptCookies(page);
  await page.locator('#onboarding-full-name').fill('בדיקת גדר');
  await page.getByRole('button', { name: 'המשך' }).click({ force: true });
  await page.getByRole('radio', { name: /גבר/ }).click();
  await page.getByRole('radio', { name: /סיגול אורח חיים/ }).click();
  await page.locator('input[type="date"]').fill('1990-01-15');
  await page.getByTestId('onboarding-consent-open').click();
  await page.getByTestId('consent-checkbox').check({ force: true });
  await page.getByTestId('consent-typed').fill('מסכים');
  await page.getByTestId('consent-submit').click();
  await page.getByRole('button', { name: 'המשך' }).click();
  await page.getByRole('radio', { name: /בוקר/ }).click();
  await page.getByRole('radio', { name: /חוסר זמן/ }).click();
  await page.getByRole('button', { name: 'המשך' }).click();
  await page.getByRole('radio', { name: /לא עכשיו/ }).click();
  await page.getByRole('button', { name: 'המשך' }).click();
  await page.getByRole('button', { name: 'המשך' }).click();
  await page.locator('input[type="email"]').fill(accountEmail);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('radio', { name: /לשמור 24 חודשים/ }).click();
  await page.locator('#onboarding-legal-consent').check();
}

async function openContext(browser, origin) {
  const context = await browser.newContext();
  await context.addCookies([{
    name: 'pl_provision',
    value: provision,
    url: origin,
    httpOnly: true,
    sameSite: 'Lax',
    secure: origin.startsWith('https://'),
  }]);
  const page = await context.newPage();
  return { context, page };
}

const { chromium } = await import('playwright');
const browser = await chromium.launch({ headless: true });
let csrfStatus = 0;
try {
  psql(`insert into auth.users (id, email, aud, role) values ('${sentinelUser}', 'sentinel-${sentinelUser.slice(0, 8)}@example.test', 'authenticated', 'authenticated')`);
  psql(`insert into auth.sessions (id, user_id) values ('${sentinelSession}', '${sentinelUser}')`);
  const before = counts();

  const csrf = await fetch(new URL('/register/form', appA), {
    method: 'POST',
    headers: { origin: 'https://evil.example', 'content-type': 'application/x-www-form-urlencoded' },
    body: 'full_name=x',
    redirect: 'manual',
  });
  csrfStatus = csrf.status;
  await csrf.arrayBuffer();
  if (counts().users !== before.users) throw new Error('foreign origin created an account');

  const left = await openContext(browser, appA);
  const right = await openContext(browser, appB);
  await fill(left.page, appA, email);
  await fill(right.page, appB, email);
  await Promise.all([
    left.page.getByRole('button', { name: /סיום/ }).click(),
    right.page.getByRole('button', { name: /סיום/ }).click(),
  ]);
  await left.page.getByText(/החשבון כבר נפתח|מעבירים אותך|ההרשמה הזו כבר נפתחה|האימייל צריך/).first().waitFor({ timeout: 30000 }).catch(() => {});
  await right.page.getByText(/החשבון כבר נפתח|מעבירים אותך|ההרשמה הזו כבר נפתחה|האימייל צריך/).first().waitFor({ timeout: 30000 }).catch(() => {});

  const retry = await openContext(browser, appA);
  await fill(retry.page, appA, email);
  await retry.page.getByRole('button', { name: /סיום/ }).click();
  await retry.page.getByText('החשבון כבר נפתח. אפשר להיכנס עם הכניסה הקיימת.').waitFor({ timeout: 30000 });

  const mismatch = await openContext(browser, appB);
  await fill(mismatch.page, appB, `other-${email}`);
  await mismatch.page.getByRole('button', { name: /סיום/ }).click();
  await mismatch.page.getByText('האימייל צריך להיות האימייל המאומת מהחשבון המרכזי').waitFor({ timeout: 30000 });

  const after = counts();
  if (after.users !== '1' || after.sessions !== '1' || after.grants !== '1' || after.done !== '1' || after.sentinel !== '1') {
    throw new Error(`pair result users=${after.users} sessions=${after.sessions} grants=${after.grants} done=${after.done} sentinel=${after.sentinel}`);
  }
  const evidence = {
    form: 'submitted',
    database: db,
    servers: [appA, appB],
    duplicate: 'one-account',
    retry: 'existing-login',
    mismatch: 'rejected',
    csrfStatus,
    sessions: 1,
    grants: 1,
    sentinelKept: true,
  };
  mkdirSync(dirname(evidencePath), { recursive: true });
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  process.stdout.write('signup-form-pair ok\n');
} finally {
  await browser.close();
  psql(`delete from auth.sessions where user_id = '${sentinelUser}'`);
  psql(`delete from auth.users where id = '${sentinelUser}'`);
}
