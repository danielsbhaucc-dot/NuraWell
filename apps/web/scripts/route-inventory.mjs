// Usage: node inventory.mjs <baseUrl> <outDir> [label]
// Shoots every public route (from app/**/page.tsx) at 390 and 1440, and runs a pixel-level near-white check:
// rendered elements whose computed background is near-white (L>96%, alpha>=0.6) over >= 2% of the viewport.
import { chromium } from 'playwright';
import fs from 'node:fs'; import path from 'node:path';
const [base='http://localhost:3311', out='/workspace/design-audit/after/full', label='after'] = process.argv.slice(2);
const ROUTES = process.env.ROUTES ? process.env.ROUTES.split(',') : ['/', '/v2', '/login', '/register', '/register/form', '/register/check-email', '/register/verified', '/about', '/accessibility',
  '/contact', '/cookies', '/privacy', '/terms', '/safety', '/pricing', '/coming-soon', '/device-check', '/challenge', '/challenge/intro', '/this-route-404',
  '/home', '/plans', '/journey', '/progress', '/profile', '/guides', '/summaries', '/settings/security', '/ops'];
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch();
const rows = [];
for (const [vw, vh, tag] of [[390, 844, 'mobile'], [1440, 900, 'desktop']]) {
  const ctx = await b.newContext({ viewport: { width: vw, height: vh }, reducedMotion: 'reduce', locale: 'he-IL' });
  const page = await ctx.newPage();
  // Local runs: the login photo comes from a server route that needs real env; reuse prod's public JSON when asked.
  if (process.env.LOGIN_BG_FROM) {
    const bg = await fetch(process.env.LOGIN_BG_FROM + '/api/v1/login-background').then((r) => r.text()).catch(() => null);
    if (bg) await page.route('**/api/v1/login-background*', (rt) => rt.fulfill({ status: 200, contentType: 'application/json', body: bg }));
  }
  for (const r of ROUTES) {
    let status = 0, finalUrl = '';
    try { const res = await page.goto(base + r, { waitUntil: 'load', timeout: 30000 }); status = res?.status() ?? 0; } catch { status = -1; }
    await page.getByRole('button', { name: 'הבנתי, תודה' }).click({ timeout: 2500 }).catch(() => {}); // local cookie banner only
    await page.waitForTimeout(r === '/' || r === '/v2' ? 14000 : 1500);
    finalUrl = page.url().replace(base, '');
    const name = `${tag}-${label}-${r === '/' ? 'root' : r.slice(1).replace(/\//g, '_')}.png`;
    await page.screenshot({ path: path.join(out, name), fullPage: false }).catch(() => {});
    const nw = await page.evaluate(() => {
      const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p[3] ?? 1 }; };
      const area = innerWidth * innerHeight; const hits = [];
      for (const el of document.querySelectorAll('body *')) {
        const cs = getComputedStyle(el); const c = parse(cs.backgroundColor); if (!c || c.a < 0.6) continue;
        const L = (Math.max(c.r, c.g, c.b) + Math.min(c.r, c.g, c.b)) / 2 / 2.55; if (L <= 96) continue;
        const rc = el.getBoundingClientRect(); const vis = Math.max(0, Math.min(rc.right, innerWidth) - Math.max(rc.left, 0)) * Math.max(0, Math.min(rc.bottom, innerHeight) - Math.max(rc.top, 0));
        if (vis / area >= 0.02) hits.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)} ${cs.backgroundColor} ${(vis / area * 100).toFixed(1)}%`);
      }
      return hits;
    });
    rows.push({ tag, r, status, finalUrl, name, nearWhite: nw });
  }
  await ctx.close();
}
await b.close();
const md = ['# Route inventory — ' + label + ' (' + base + ')', '', '| vp | route | status | landed on | near-white elements |', '|---|---|---|---|---|',
  ...rows.map((x) => `| ${x.tag} | ${x.r} | ${x.status} | ${x.finalUrl} | ${x.nearWhite.length ? x.nearWhite.join('<br>') : '0'} |`)];
fs.writeFileSync(path.join(out, `INDEX-${label}.md`), md.join('\n') + '\n');
console.log(rows.filter((x) => x.nearWhite.length).map((x) => `${x.tag} ${x.r}: ${x.nearWhite.length}`).join('\n') || 'no near-white');
