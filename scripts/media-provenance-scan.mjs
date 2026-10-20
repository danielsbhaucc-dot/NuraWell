#!/usr/bin/env node
/**
 * Media provenance scanner (CI, full git history). Inventories every media asset in the repo:
 * apps/web/public/**, inline <svg> in components/app, bundled fonts, Google fonts (next/font),
 * icon libraries. For each: SHA-256, first/last commit, usage sites, file bytes (≤3 MB) → POSTs
 * the manifest to /api/v1/legal/media/ingest (CRON_SECRET), which signs + timestamps changes.
 *   node scripts/media-provenance-scan.mjs --dry   # writes media-manifest.json only
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const WEB = 'apps/web';
const DRY = process.argv.includes('--dry');
const MAX_INLINE = 3_000_000;
const MIME = { svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', avif: 'image/avif', gif: 'image/gif', ico: 'image/x-icon', mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', ogg: 'audio/ogg', mp4: 'video/mp4', webm: 'video/webm', ttf: 'font/ttf', otf: 'font/otf', woff: 'font/woff', woff2: 'font/woff2' };
const sha = (b) => createHash('sha256').update(b).digest('hex');
const git = (...a) => { try { return execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 }).trim(); } catch { return ''; } };

function walk(dir, out = []) {
  for (const n of readdirSync(dir)) {
    if (n === 'node_modules' || n.startsWith('.')) continue;
    const p = path.join(dir, n);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}
function commits(rel) {
  const log = git('log', '--follow', '--format=%H\x1f%aI\x1f%an\x1f%s', '--', rel);
  const rows = log.split('\n').filter(Boolean).map((l) => { const [s, date, author, subject] = l.split('\x1f'); return { sha: s, date, author, subject: (subject ?? '').slice(0, 300) }; });
  return { first: rows.at(-1) ?? null, last: rows[0] ?? null, count: rows.length };
}
const sources = walk(path.join(ROOT, WEB)).filter((p) => /\.(tsx?|css|json|webmanifest|html)$/.test(p) && !/\/(tests|\.next|node_modules)\//.test(p)).map((p) => [path.relative(ROOT, p), readFileSync(p, 'utf8')]);
function routeOf(rel) {
  const m = /^apps\/web\/app\/(.*)\/(page|layout)\.tsx$/.exec(rel);
  if (!m) return rel.replace(/^apps\/web\//, '');
  return '/' + m[1].split('/').filter((s) => !/^\(.*\)$/.test(s)).join('/') + (m[2] === 'layout' ? ' (layout)' : '');
}
function usagesOf(needles) {
  const hits = new Set();
  for (const [rel, txt] of sources) if (needles.some((n) => n && txt.includes(n))) hits.add(routeOf(rel));
  return [...hits].slice(0, 40);
}
const kindFor = (rel, ext) => (/\.(ttf|otf|woff2?)$/.test(rel) ? 'font' : /^(mp3|m4a|wav|ogg)$/.test(ext) ? 'audio' : /^(mp4|webm)$/.test(ext) ? 'video' : /icon|favicon|apple-touch/.test(rel) ? 'icon' : ext === 'svg' ? 'illustration' : 'image');

const entries = [];
// 1) static files: public/** + bundled fonts
const files = [...walk(path.join(ROOT, WEB, 'public')), ...walk(path.join(ROOT, WEB, 'lib/legal/fonts'))];
for (const abs of files) {
  const rel = path.relative(ROOT, abs);
  const ext = path.extname(rel).slice(1).toLowerCase();
  if (!MIME[ext]) continue;
  const buf = readFileSync(abs);
  const c = commits(rel);
  const pub = rel.startsWith(`${WEB}/public/`) ? rel.slice(`${WEB}/public`.length) : null;
  const kind = kindFor(rel, ext);
  const fam = kind === 'font' ? path.basename(rel).split('-')[0] : null;
  entries.push({ asset_key: `repo:${rel}`, origin: kind === 'font' && !pub ? 'font' : 'repo', kind, path: rel, public_url: pub, title: path.basename(rel), mime: MIME[ext], sha256: sha(buf),
    content_b64: buf.length <= MAX_INLINE ? buf.toString('base64') : null, usages: pub ? usagesOf([pub, pub.slice(1)]) : usagesOf([path.basename(rel)]),
    first_commit: c.first, last_commit: c.last, commits: c.count, font_family: fam });
}
// 2) inline SVG illustrations in components/app
for (const [rel, txt] of sources) {
  if (!rel.endsWith('.tsx')) continue;
  const blocks = txt.match(/<svg[\s\S]*?<\/svg>/g) ?? [];
  if (!blocks.length) continue;
  const c = commits(rel);
  const comp = path.basename(rel, '.tsx');
  const users = usagesOf([`/${comp}'`, `/${comp}"`]).filter((u) => !u.endsWith(rel.replace(/^apps\/web\//, '')));
  blocks.forEach((svg, i) => {
    if (svg.length < 120) return; // trivial glyphs (chevrons etc.)
    const buf = Buffer.from(svg);
    entries.push({ asset_key: `inline:${rel}#${i}`, origin: 'inline', kind: svg.length < 1500 ? 'icon' : 'illustration', path: rel, title: `${comp} · SVG ${i + 1}`, mime: 'image/svg+xml', sha256: sha(buf),
      content_b64: buf.toString('base64'), usages: [routeOf(rel), ...users], first_commit: c.first, last_commit: c.last, commits: c.count });
  });
}
// 3) Google fonts via next/font
const fontsTs = sources.find(([r]) => r === `${WEB}/app/fonts.ts`)?.[1] ?? '';
const fam = /import\s*\{([^}]+)\}\s*from\s*'next\/font\/google'/.exec(fontsTs)?.[1].split(',').map((s) => s.trim()).filter(Boolean) ?? [];
const fc = commits(`${WEB}/app/fonts.ts`);
for (const f of fam) {
  const family = f.replace(/_/g, ' ');
  entries.push({ asset_key: `font:google/${family}`, origin: 'font', kind: 'font', path: `${WEB}/app/fonts.ts`, title: `${family} (Google Fonts)`, mime: 'font/woff2', sha256: null, content_b64: null, usages: ['כל האתר'], first_commit: fc.first, last_commit: fc.last, commits: fc.count, font_family: family });
}
// 4) icon libraries
const pkg = JSON.parse(readFileSync(path.join(ROOT, WEB, 'package.json'), 'utf8'));
const LIBS = { 'lucide-react': 'ISC' };
for (const [name, lic] of Object.entries(LIBS)) {
  const version = pkg.dependencies?.[name] ?? pkg.devDependencies?.[name];
  if (!version) continue;
  entries.push({ asset_key: `library:${name}`, origin: 'library', kind: 'icon', path: `${WEB}/package.json`, title: `${name} (אייקונים)`, mime: null, sha256: null, content_b64: null, usages: usagesOf([`from '${name}'`]).slice(0, 12), library: { name, version: String(version), license: lic } });
}

const counts = entries.reduce((m, e) => ((m[`${e.origin}/${e.kind}`] = (m[`${e.origin}/${e.kind}`] ?? 0) + 1), m), {});
console.log(`media entries: ${entries.length}`, counts);
writeFileSync('media-manifest.json', JSON.stringify(entries.map(({ content_b64, ...r }) => ({ ...r, has_bytes: !!content_b64 })), null, 2));
if (DRY) process.exit(0);

const base = (process.env.VERCEL_APP_URL || '').replace(/\/$/, '');
const secret = process.env.CRON_SECRET;
if (!base || !secret) { console.error('VERCEL_APP_URL / CRON_SECRET missing'); process.exit(1); }
const batches = [];
let cur = [], size = 0;
for (const e of entries) {
  const s = (e.content_b64?.length ?? 0) + 2000;
  if (cur.length && (size + s > 3_000_000 || cur.length >= 25)) { batches.push(cur); cur = []; size = 0; }
  cur.push(e); size += s;
}
if (cur.length) batches.push(cur);
const total = { new: 0, changed: 0, unchanged: 0, error: 0, cost: 0, absent: 0 };
for (const [i, b] of batches.entries()) {
  const last = i === batches.length - 1;
  const res = await fetch(`${base}/api/v1/legal/media/ingest`, { method: 'POST', headers: { Authorization: `Bearer ${secret}`, 'content-type': 'application/json' },
    body: JSON.stringify({ entries: b, ...(last ? { complete: true, seen: entries.map((e) => e.asset_key) } : {}) }) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) { console.error(`batch ${i + 1} failed`, res.status, j); process.exit(1); }
  for (const k of Object.keys(total)) total[k] += j[k] ?? 0;
  if (j.errors?.length) console.warn(j.errors);
}
console.log('ingest', total);
const st = await fetch(`${base}/api/v1/legal/media/scan-storage`, { method: 'POST', headers: { Authorization: `Bearer ${secret}` } });
console.log('storage', st.status, await st.text().catch(() => ''));
