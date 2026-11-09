// E2E for the demo: axe 0, no horizontal overflow, FAB never overlaps targets, keyboard, screenshots.
// Usage (from a dir with playwright + @axe-core/playwright): node e2e.mjs <distDir> <shotsDir>
import http from 'node:http'; import { readFileSync, existsSync } from 'node:fs'; import { join, extname, resolve, sep } from 'node:path';
import { createRequire } from 'node:module';
const req = createRequire(process.env.PW_DIR ? join(process.env.PW_DIR, 'x.js') : import.meta.url);
const { chromium } = req('playwright'); const { default: AxeBuilder } = req('@axe-core/playwright');
const [dist, shots] = process.argv.slice(2); (await import('node:fs')).mkdirSync(shots, { recursive: true });
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.woff2': 'font/woff2', '.txt': 'text/plain' };
const root = resolve(dist);
const srv = http.createServer((q, r) => {
  // confine every request to the demo dist dir (no ../ escapes)
  let rel; try { rel = decodeURIComponent(new URL(q.url, 'http://x').pathname); } catch { r.writeHead(400); return r.end(); }
  const p = resolve(root, '.' + (rel.endsWith('/') ? rel + 'index.html' : rel));
  if (!p.startsWith(root + sep) || !existsSync(p)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': mime[extname(p)] ?? 'application/octet-stream' }); r.end(readFileSync(p));
});
await new Promise((ok) => srv.listen(0, '127.0.0.1', ok)); const base = `http://127.0.0.1:${srv.address().port}/`;
const browser = await chromium.launch(); const fails = []; const extReq = []; const results = [];
const check = (c, m) => { if (!c) fails.push(m); };
const cases = [
  ...[320, 360, 390].flatMap((w) => [{ w, h: 740, mode: 'text130' }, { w, h: 740, mode: 'zoom130' }]),
  { w: 390, h: 844, mode: 'base' }, { w: 1440, h: 900, mode: 'base' },
];
for (const c of cases) {
  // browser zoom 130% ≡ CSS viewport /1.3 at DPR 1.3
  const z = c.mode === 'zoom130' ? 1.3 : 1;
  const ctx = await browser.newContext({ viewport: { width: Math.round(c.w / z), height: Math.round(c.h / z) }, deviceScaleFactor: c.mode === 'zoom130' ? 1.3 : 1, locale: 'he-IL', hasTouch: c.w < 1000 });
  const page = await ctx.newPage(); page.on('request', (r) => { if (!r.url().startsWith(base)) extReq.push(r.url()); });
  const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(base); await page.waitForFunction(() => !!window.__a11y);
  if (c.mode === 'text130') await page.evaluate(() => { document.documentElement.style.fontSize = '130%'; });
  await page.waitForTimeout(600); // auto relayout (observer) + FAB transition
  const tag = `${c.w}-${c.mode}`;
  const of = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  let ov = await page.evaluate(() => window.__overlaps({ pinnedOnly: true }));
  check(ov.length === 0, `${tag} FAB overlaps pinned ${JSON.stringify(ov)}`);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await page.waitForTimeout(400);
  ov = await page.evaluate(() => window.__overlaps());
  check(ov.length === 0, `${tag} FAB overlaps at page end ${JSON.stringify(ov)}`);
  await page.screenshot({ path: `${shots}/${tag}-end.png` });
  await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(300); { const o = await of(); check(o <= 0, `${tag} overflow closed ${o} ${await page.evaluate(() => [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > document.documentElement.clientWidth + .5 || e.getBoundingClientRect().left < -.5).map((e) => e.id || e.className || e.tagName).slice(0, 6).join('|'))}`); }
  // FAB inside viewport
  const fb = await page.locator('.ca11y-fab').boundingBox(); check(fb && fb.x >= 0 && fb.x + fb.width <= c.w / z && fb.y + fb.height <= c.h / z, `${tag} FAB off-screen`);
  let ax = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze(); check(ax.violations.length === 0, `${tag} axe closed: ${ax.violations.map((v) => v.id)}`);
  await page.screenshot({ path: `${shots}/${tag}-closed.png` });
  // keyboard: Tab to FAB, Enter opens, focus inside
  await page.locator('.ca11y-fab').focus(); await page.keyboard.press('Enter');
  check(await page.evaluate(() => document.querySelector('[role="dialog"]')?.contains(document.activeElement)), `${tag} focus not in dialog`);
  await page.waitForTimeout(350);
  check(await of() <= 0, `${tag} overflow open`);
  const pb = await page.locator('[role="dialog"]').boundingBox(); check(pb && pb.x >= -1 && pb.x + pb.width <= c.w / z + 1, `${tag} panel exceeds width ${JSON.stringify(pb)}`);
  ax = await new AxeBuilder({ page }).include('#ca11y-root').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze(); check(ax.violations.length === 0, `${tag} axe open: ${ax.violations.map((v) => v.id + ':' + v.nodes.length)}`);
  await page.screenshot({ path: `${shots}/${tag}-open.png` });
  if (c.mode === 'base') {
    await page.getByRole('button', { name: 'צבע וניגודיות' }).click();
    await page.getByRole('radio', { name: 'שחור־צהוב' }).click(); const bold = page.getByRole('switch', { name: /טקסט מודגש/ }); if (!(await bold.isVisible())) await page.getByRole('button', { name: 'טקסט', exact: true }).click(); await page.getByRole('switch', { name: /טקסט מודגש/ }).click();
    await page.waitForTimeout(200); await page.screenshot({ path: `${shots}/${tag}-hc-open.png` });
    await page.keyboard.press('Escape'); await page.waitForTimeout(350);
    ax = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze(); check(ax.violations.length === 0, `${tag} axe HC: ${ax.violations.map((v) => v.id)}`);
    await page.screenshot({ path: `${shots}/${tag}-hc-page.png` });
    check(await page.evaluate(() => document.activeElement?.classList.contains('ca11y-fab')), `${tag} focus not returned`);
    await page.keyboard.press('Alt+KeyR'); check(await page.evaluate(() => window.__a11y.get().contrast) === 'off', `${tag} Alt+R reset`);
  } else {
    if (c.w < 1000) { // swipe down closes
      const h = await page.locator('.ca11y-grip, .ca11y-head').first().boundingBox();
      await page.mouse.move(h.x + h.width / 2, h.y + 8); await page.mouse.down(); await page.mouse.move(h.x + h.width / 2, h.y + 260, { steps: 8 }); await page.mouse.up();
      await page.waitForTimeout(450); check(!(await page.evaluate(() => window.__a11y.isOpen())), `${tag} swipe did not close`);
    }
  }
  check(errs.length === 0, `${tag} page errors ${errs}`);
  results.push(tag); await ctx.close();
}
await browser.close(); srv.close();
check(extReq.length === 0, `external requests: ${[...new Set(extReq)]}`);
console.log(JSON.stringify({ cases: results, fails }, null, 1)); process.exit(fails.length ? 1 : 0);
