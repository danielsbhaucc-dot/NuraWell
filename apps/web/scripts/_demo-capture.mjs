/**
 * DEMO ONLY. Captures local product screenshots of a fictional user.
 * Requires NURAWELL_LOCAL_DEMO=1 and a local Postgres/PostgREST/auth stub.
 * Do not point this at production. Do not commit the exported images.
 */
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const OUT = '/opt/cursor/artifacts/nurawell-product';
fs.mkdirSync(OUT, { recursive: true });

const EMAIL = 'noa.demo@nurawell.invalid';
const PASSWORD = 'DemoNoa-local-2026';

const targets = [
  { id: 'mobile', viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 },
  { id: 'desktop', viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
];

async function save(page, name) {
  const png = path.join(OUT, `${name}.png`);
  const webp = path.join(OUT, `${name}.webp`);
  await page.screenshot({ path: png, type: 'png', animations: 'disabled' });
  await sharp(png).webp({ quality: 90 }).toFile(webp);
  const meta = await sharp(png).metadata();
  console.log('saved', name, meta.width, meta.height);
}

async function settle(page) {
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
  });
  await page.waitForTimeout(900);
}

async function dismissOverlays(page) {
  await page.addStyleTag({
    content: `
      nextjs-portal, #devtools-indicator, [data-nextjs-toast], [data-next-badge],
      [data-nextjs-dev-tools-button] { display: none !important; }
    `,
  }).catch(() => {});
  const dialog = page.locator('[role="dialog"]');
  if (await dialog.count()) {
    const text = await dialog.first().innerText().catch(() => '');
    console.log('DIALOG OPEN:', text.slice(0, 180).replace(/\n/g, ' | '));
  }
  const toast = page.locator('[role="status"], [role="alert"]');
  if (await toast.count()) {
    const t = await toast.first().innerText().catch(() => '');
    if (t.trim()) console.log('TOAST:', t.slice(0, 120).replace(/\n/g, ' | '));
  }
}

async function prep(page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('nurawell-cookie-notice', '2026-10-20');
    } catch {}
  });
}

async function login(page) {
  await page.goto('http://127.0.0.1:3000/login', { waitUntil: 'networkidle', timeout: 90000 });
  await settle(page);
  await page.locator('text=NuraWell').first().waitFor({ timeout: 20000 });
  await dismissOverlays(page);
  await save(page, `logo_login_${page.__id}`);
  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL(/\/home/, { timeout: 60000 });
  await page.waitForTimeout(4500);
  await dismissOverlays(page);
}

async function shootHome(page) {
  await page.goto('http://127.0.0.1:3000/home', { waitUntil: 'networkidle', timeout: 90000 });
  await page.locator('text=אלמוג').first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(1800);
  await dismissOverlays(page);
  await page.locator('text=צעד קטן להיום').first().waitFor({ timeout: 20000 });
  await save(page, `home_greeting_${page.__id}`);
}

async function shootJourney(page) {
  await page.goto('http://127.0.0.1:3000/journey', { waitUntil: 'networkidle', timeout: 90000 });
  const station = page.locator('text=מים לפני ארוחות').first();
  await station.waitFor({ timeout: 30000 });
  await station.scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);
  await dismissOverlays(page);
  await save(page, `journey_station_${page.__id}`);
}

async function shootPlan(page) {
  await page.goto('http://127.0.0.1:3000/plans', { waitUntil: 'networkidle', timeout: 90000 });
  await page.locator('text=התוכנית של נועה').first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(800);
  await dismissOverlays(page);
  await save(page, `plan_${page.__id}`);
}

async function scrollBoxIntoView(locator) {
  await locator.evaluate((el) => {
    function scrollParent(node) {
      let n = node.parentElement;
      while (n && n !== document.body) {
        const s = getComputedStyle(n);
        if (/(auto|scroll)/.test(s.overflowY) && n.scrollHeight > n.clientHeight + 4) return n;
        n = n.parentElement;
      }
      return document.scrollingElement || document.documentElement;
    }
    const scroller = scrollParent(el);
    const nav = document.querySelector('nav');
    for (let i = 0; i < 12; i += 1) {
      const rect = el.getBoundingClientRect();
      const limit = (nav ? nav.getBoundingClientRect().top : window.innerHeight) - 20;
      const topLimit = 96;
      if (rect.top >= topLimit && rect.bottom <= limit) return;
      const delta = rect.bottom > limit ? rect.bottom - limit : rect.top - topLimit;
      if (scroller === document.documentElement || scroller === document.scrollingElement) {
        window.scrollBy(0, delta);
      } else {
        scroller.scrollTop += delta;
      }
    }
  });
}

async function shootSettings(page) {
  await page.goto('http://127.0.0.1:3000/settings/almog', { waitUntil: 'networkidle', timeout: 90000 });
  const heading = page.getByRole('heading', { name: 'איך אלמוג מדבר איתכם' });
  await heading.waitFor({ timeout: 30000 });
  const tones = page.locator('[aria-label="סגנון ליווי"]');
  await tones.waitFor({ timeout: 30000 });
  const direct = page.getByRole('radio', { name: /ישיר/ });
  await direct.waitFor();
  await heading.evaluate((el) => {
    document.documentElement.style.scrollBehavior = 'auto';
    function scrollParent(node) {
      let n = node.parentElement;
      while (n && n !== document.documentElement) {
        const s = getComputedStyle(n);
        if (/(auto|scroll)/.test(s.overflowY) && n.scrollHeight > n.clientHeight + 4) return n;
        n = n.parentElement;
      }
      return null;
    }
    const scroller = scrollParent(el);
    const delta = el.getBoundingClientRect().top - 108;
    if (!scroller) window.scrollBy(0, delta);
    else scroller.scrollTop += delta;
  });
  await scrollBoxIntoView(direct);
  await page.waitForTimeout(400);
  await dismissOverlays(page);
  await save(page, `settings_coaching_${page.__id}`);
}

async function shootChat(page) {
  await page.goto('http://127.0.0.1:3000/home', { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: 'שיחה עם אלמוג' }).click();
  await page.getByRole('tab', { name: /היסטוריה/ }).click();
  const sessionBtn = page.getByRole('button', { name: /צהריים עם אלמוג/ });
  try {
    await sessionBtn.waitFor({ timeout: 15000 });
  } catch (err) {
    const blob = await page.locator('body').innerText();
    console.log('CHAT BODY SNIP', blob.slice(0, 800).replace(/\n/g, ' | '));
    throw err;
  }
  await sessionBtn.click();
  await page.getByText('המים נכנסו, יפה').waitFor({ timeout: 20000 });
  await page.waitForTimeout(700);
  await dismissOverlays(page);
  await save(page, `chat_almog_${page.__id}`);
}

const onlyShot = process.argv[2] || '';
const onlySize = process.argv[3] || '';
const browser = await chromium.launch({ headless: true });
const errors = [];
for (const t of targets) {
  if (onlySize && t.id !== onlySize) continue;
  const context = await browser.newContext({
    viewport: t.viewport,
    deviceScaleFactor: t.deviceScaleFactor,
    locale: 'he-IL',
    timezoneId: 'Asia/Jerusalem',
    colorScheme: 'light',
  });
  const page = await context.newPage();
  page.__id = t.id;
  page.on('pageerror', (e) => errors.push(`${t.id} ${e.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`${t.id} console ${msg.text().slice(0, 200)}`);
  });
  await prep(page);
  console.log('---', t.id);
  await login(page);
  if (!onlyShot || onlyShot === 'home') await shootHome(page);
  if (!onlyShot || onlyShot === 'journey') await shootJourney(page);
  if (!onlyShot || onlyShot === 'plan') await shootPlan(page);
  if (!onlyShot || onlyShot === 'settings') await shootSettings(page);
  if (!onlyShot || onlyShot === 'chat') await shootChat(page);
  await context.close();
}
await browser.close();
if (errors.length) {
  console.log('PAGE ERRORS');
  for (const e of errors.slice(0, 40)) console.log(e);
}
console.log('DONE');
