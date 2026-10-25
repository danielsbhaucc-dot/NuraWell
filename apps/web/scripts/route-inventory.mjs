// Usage: node inventory.mjs <baseUrl> <outDir> [label]
// Shoots every public route (from app/**/page.tsx) at 390 and 1440, and runs a pixel-level near-white check:
// rendered elements whose computed background is near-white (L>96%, alpha>=0.6) over >= 2% of the viewport.
import { chromium } from 'playwright';
import fs from 'node:fs'; import path from 'node:path';
const [base='http://localhost:3311', out='/workspace/design-audit/after/full', label='after'] = process.argv.slice(2);
const ROUTES = process.env.ROUTES ? process.env.ROUTES.split(',') : ['/', '/v2', '/login', '/register', '/register/form', '/register/check-email', '/register/verified', '/about', '/accessibility',
  '/contact', '/cookies', '/privacy', '/terms', '/safety', '/pricing', '/coming-soon', '/device-check', '/challenge', '/challenge/intro', '/this-route-404',
  '/home', '/plans', '/journey', '/progress', '/profile', '/guides', '/summaries', '/settings/security', '/ops'];
const VERDICTS = fs.existsSync(path.join(out, 'verdicts.json')) ? JSON.parse(fs.readFileSync(path.join(out, 'verdicts.json'), 'utf8')) : {};
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch();
const rows = [];
for (const [vw, vh, tag] of [[390, 844, 'mobile'], [1440, 900, 'desktop']]) {
  const ctx = await b.newContext({ viewport: { width: vw, height: vh }, reducedMotion: 'reduce', locale: 'he-IL' });
  // Pre-accept the (informational) cookie notice so pages are visible; the banner itself gets one dedicated shot below.
  await ctx.addInitScript(() => { try { localStorage.setItem('nurawell-cookie-notice', '2026-10-20'); } catch {} });
  const page = await ctx.newPage();
  // Local runs: the login photo comes from a server route that needs real env; reuse prod's public JSON when asked.
  if (process.env.LOGIN_BG_FROM) {
    const bg = await fetch(process.env.LOGIN_BG_FROM + '/api/v1/login-background').then((r) => r.text()).catch(() => null);
    if (bg) await page.route('**/api/v1/login-background*', (rt) => rt.fulfill({ status: 200, contentType: 'application/json', body: bg }));
  }
  for (const r of ROUTES) {
    let status = 0, finalUrl = '';
    try { const res = await page.goto(base + r, { waitUntil: 'load', timeout: 30000 }); status = res?.status() ?? 0; } catch { status = -1; }
    await page.waitForTimeout(r === '/' || r === '/v2' ? 14000 : 1500);
    finalUrl = page.url().replace(base, '');
    const name = `${tag}-${label}-${r === '/' ? 'root' : r.slice(1).replace(/\//g, '_')}.png`;
    await page.screenshot({ path: path.join(out, name), fullPage: false }).catch(() => {});
    const nw = await page.evaluate(() => {
      // near-white: HSL L>96% (alpha>=0.6) over >=2% of viewport.
      // flat cream: OKLCH L>0.90 with chroma<0.03 (alpha>=0.6) over >=8% of viewport (large flat light surfaces).
      const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p[3] ?? 1 }; };
      const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
      const oklch = ({ r, g, b }) => { const R = lin(r), G = lin(g), B = lin(b);
        const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B), m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B), s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
        const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, Bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
        return { L, C: Math.hypot(A, Bb) }; };
      const area = innerWidth * innerHeight; const hits = [];
      for (const el of [document.documentElement, document.body, ...document.querySelectorAll('body *')]) {
        const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none') continue;
        const c = parse(cs.backgroundColor); if (!c || c.a < 0.6) continue;
        const rc = el.getBoundingClientRect(); const vis = Math.max(0, Math.min(rc.right, innerWidth) - Math.max(rc.left, 0)) * Math.max(0, Math.min(rc.bottom, innerHeight) - Math.max(rc.top, 0));
        const share = vis / area;
        const hsl = (Math.max(c.r, c.g, c.b) + Math.min(c.r, c.g, c.b)) / 2 / 2.55; const ok = oklch(c);
        const tag = `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 50)} ${cs.backgroundColor} ${(share * 100).toFixed(1)}%`;
        if (hsl > 96 && share >= 0.02) hits.push('NEAR-WHITE ' + tag);
        else if (ok.L > 0.9 && ok.C < 0.03 && share >= 0.08) hits.push('FLAT-CREAM ' + tag);
      }
      return hits;
    });
    rows.push({ tag, r, status, finalUrl, name, nearWhite: nw });
  }
  if (tag === 'mobile') { // one dedicated shot of the cookie notice itself
    const c2 = await b.newContext({ viewport: { width: vw, height: vh }, reducedMotion: 'reduce', locale: 'he-IL' }); const p2 = await c2.newPage();
    await p2.goto(base + '/about', { waitUntil: 'load', timeout: 30000 }).catch(() => {}); await p2.waitForTimeout(2500);
    await p2.screenshot({ path: path.join(out, `${tag}-${label}-cookie-banner.png`) }).catch(() => {}); await c2.close();
  }
  await ctx.close();
}
await b.close();
const md = ['# Route inventory — ' + label + ' (' + base + ')', '', '| vp | route | status | landed on | near-white / flat-cream elements | verdict |', '|---|---|---|---|---|---|',
  ...rows.map((x) => `| ${x.tag} | ${x.r} | ${x.status} | ${x.finalUrl} | ${x.nearWhite.length ? x.nearWhite.join('<br>') : '0'} | ${(VERDICTS[x.r] ?? '—')} |`)];
fs.writeFileSync(path.join(out, `INDEX-${label}.md`), md.join('\n') + '\n');
console.log(rows.filter((x) => x.nearWhite.length).map((x) => `${x.tag} ${x.r}: ${x.nearWhite.length}`).join('\n') || 'no near-white');
