#!/usr/bin/env node
/**
 * Design guard (DESIGN_SYSTEM.md). Fails when feature code adds:
 *  - hard-coded white (#fff, #ffffff, white, bg-white, rgb(255,255,255), from/via/to-white, border/ring/fill-white)
 *  - raw hex colors or arbitrary Tailwind colors (bg-[#..], text-[#..]) outside token files
 *  - near-white in any form (scripts/near-white.mjs): light hex/rgb/hsl/oklch (L>96%), bg-white/60+, white aliases
 *  - mint / sage / cream light surfaces (scripts/mint-surface.mjs): light colors with G > R,B or warm cream,
 *    and light green Tailwind fills (bg-emerald-50 ...). ZERO tolerance, not ratcheted.
 *  - raw styled <button className=...> in feature folders (use components/ui Button)
 * Ratchet: existing debt is frozen in scripts/design-lint-baseline.json (per file, per rule).
 * A file may only go DOWN. Run `node scripts/design-lint.mjs --update` after you REMOVE debt.
 */
import fs from 'node:fs';
import path from 'node:path';
import { findNearWhite, nearWhiteAliases } from './near-white.mjs';
import { findMintSurfaces } from './mint-surface.mjs';
import { MINT_ALLOW } from './mint-allow.mjs';
const MINT_CLASS = /\b(?:bg|from|via|to)-(?:emerald|green|teal|lime|mint|sage)-(?:50|100|200)\b/g;
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const BASELINE = path.join(ROOT, 'scripts/design-lint-baseline.json');
const DIRS = ['app', 'components', 'lib'];
// Token / generated / legal-export files where literal colors are the point.
const ALLOW = [
  /^app\/globals\.css$/, // token layer
  /^components\/ui\//, // primitives use tokens only, but may reference rgba glows
  /^lib\/legal\/media\//, // rendered evidence images (print)
  /^lib\/email\//, /email-templates?/i, // email HTML must inline colors
  /^app\/landing-v2\/landing-html\.ts$/, // frozen canonical landing
  /opengraph-image|icon\.tsx|apple-icon|manifest/, // OG/icon renderers need literals
];
const RULES = {
  white: /\bbg-white\b|\b(?:from|via|to|border|ring|fill|stroke|divide|outline)-white\b|#fff(?:fff)?\b|rgba?\(\s*255\s*,\s*255\s*,\s*255\s*[,)]|(?:color|background(?:-color)?|fill|stroke)\s*:\s*['"]?white\b|['"]white['"]/gi,
  rawHex: /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g,
  arbitraryColor: /\b(?:bg|text|from|via|to|border|ring|fill|stroke|shadow)-\[(?:#|rgb|hsl)/g,
  rawButton: /<button\b[^>]*\bclassName=/g,
};
const ALIASES = nearWhiteAliases(fs.readFileSync(path.join(ROOT, 'app/globals.css'), 'utf8'));
const FEATURE_BUTTON_SCOPE = /^components\/(?!ui\/)|^app\//;
function walk(d, out = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    // Coming-soon screen is frozen by owner decision: never lint/codemod it.
    if (/coming-?soon/i.test(e.name)) continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(tsx?|css|mjs)$/.test(e.name) && !/\.test\./.test(e.name)) out.push(p);
  }
  return out;
}
const counts = {};
// globals.css is the token layer (raw hex allowed) but must not paint near-white fills either.
{
  const css = fs.readFileSync(path.join(ROOT, 'app/globals.css'), 'utf8')
    .replace(/@theme\s*\{[\s\S]*?\n\}/g, '') // token definitions (on-dark text tokens live here)
    .replace(/@media print\s*\{(?:[^{}]|\{[^{}]*\})*\}/g, '') // print CSS is allowlisted
    .replace(/(?:^|[;{\s])(?:color|caret-color|-webkit-text-fill-color|text-decoration-color)\s*:[^;]*;/g, ';'); // white TEXT is fine
  const nw = findNearWhite(css).length;
  if (nw) counts['app/globals.css'] = { nearWhite: nw };
}
for (const d of DIRS) for (const f of walk(path.join(ROOT, d))) {
  const rel = path.relative(ROOT, f).split(path.sep).join('/');
  if (ALLOW.some((r) => r.test(rel))) continue;
  const src = fs.readFileSync(f, 'utf8').replace(/\/\/ design-lint-allow:[^\n]*\n[^\n]*/g, '');
  const c = {};
  for (const [k, re] of Object.entries(RULES)) {
    if (k === 'rawButton' && !FEATURE_BUTTON_SCOPE.test(rel)) continue;
    const n = (src.match(re) || []).length;
    if (n) c[k] = n;
  }
  const nw = findNearWhite(src, ALIASES).length;
  if (nw) c.nearWhite = nw;
  if (Object.keys(c).length) counts[rel] = c;
}
// Zero-tolerance mint/sage/cream surface check (app/components/lib incl. globals.css + ui/, plus ../../packages).
const mintFails = [];
function walkAll(d, out = []) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (e.name === 'node_modules' || e.name.startsWith('.')) continue; const p = path.join(d, e.name); if (e.isDirectory()) walkAll(p, out); else if (/\.(tsx?|css)$/.test(e.name) && !/\.test\./.test(e.name)) out.push(p); } return out; }
const PKGS = path.join(ROOT, '../../packages'); // shared @platform/* packages (tokens, ui, sheets)
for (const f of [...DIRS.flatMap((d) => walkAll(path.join(ROOT, d))), ...(fs.existsSync(PKGS) ? walkAll(PKGS) : [])]) {
  const rel = path.relative(ROOT, f).split(path.sep).join('/');
  if (MINT_ALLOW.some((r) => r.test(rel))) continue;
  let src = fs.readFileSync(f, 'utf8');
  const cut = src.indexOf('/* Coming-soon is frozen:'); if (cut >= 0) src = src.slice(0, cut); // frozen legacy token block
  src = src.replace(/\/\/ design-lint-allow:[^\n]*\n[^\n]*/g, '');
  const hits = findMintSurfaces(src).map((h) => `${h.kind} ${h.match}`).concat(src.match(MINT_CLASS) || []);
  if (hits.length) mintFails.push(`${rel}: ${hits.slice(0, 4).join(', ')}${hits.length > 4 ? ` (+${hits.length - 4})` : ''}`);
}
if (mintFails.length) {
  console.error('✖ design-lint: mint/sage/cream light surface (use neutral tokens: canvas #dedee3, surface #f2f2f6, background-soft #e8e8ed, hairline #cfd0d6):\n  ' + mintFails.join('\n  '));
  process.exit(1);
}
if (process.argv.includes('--update')) {
  fs.writeFileSync(BASELINE, JSON.stringify(counts, null, 1) + '\n');
  console.log(`design-lint: baseline written (${Object.keys(counts).length} files with frozen debt)`);
  process.exit(0);
}
const base = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')) : {};
const fails = [];
for (const [f, c] of Object.entries(counts)) for (const [k, n] of Object.entries(c)) {
  const was = base[f]?.[k] ?? 0;
  if (n > was) fails.push(`${f}: ${k} ${was} → ${n}`);
}
if (fails.length) {
  console.error('✖ design-lint: new off-system styling (see apps/web/DESIGN_SYSTEM.md):\n  ' + fails.join('\n  '));
  console.error('Use tokens (bg-surface, text-on-dark, forest-*, ink-*) and components/ui primitives. Justified exception: add `// design-lint-allow: <reason>` on the line above.');
  process.exit(1);
}
const shrunk = Object.entries(base).filter(([f, c]) => Object.entries(c).some(([k, n]) => (counts[f]?.[k] ?? 0) < n)).length;
console.log(`✓ design-lint: no new debt${shrunk ? ` (${shrunk} files improved — run with --update to lock it in)` : ''}`);
