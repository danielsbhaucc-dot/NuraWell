#!/usr/bin/env node
/** One-off: replace mint/sage/cream light color literals with the neutral palette (keeps alpha). See mint-surface.mjs. */
import fs from 'node:fs'; import path from 'node:path';
import { findMintSurfaces, neutralFor, parseHex, oklchToRgb } from './mint-surface.mjs';
import { MINT_ALLOW } from './mint-allow.mjs';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const toHex = (rgb, a) => '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('') + (a < 1 ? Math.round(a * 255).toString(16).padStart(2, '0') : '');
const FROZEN_START = '/* Coming-soon is frozen:';
function fix(src) {
  let cut = src.indexOf(FROZEN_START); const head = cut < 0 ? src : src.slice(0, cut), tail = cut < 0 ? '' : src.slice(cut);
  const out = head.replace(/#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b|rgba?\([^)]*\)|oklch\([^)]*\)/g, (m) => {
    if (!findMintSurfaces(m).length) return m;
    if (m.startsWith('#')) { const [r, g, b, a] = parseHex(m); return toHex(neutralFor(r, g, b), a); }
    if (m.startsWith('rgb')) { const n = m.match(/[\d.]+%?/g); const a = n[3]; const [r, g, b] = neutralFor(+n[0], +n[1], +n[2]); return a === undefined ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${a})`; }
    const n = m.match(/oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+%?))?/); const l = n[2] ? +n[1] / 100 : +n[1];
    const [r, g, b] = neutralFor(...oklchToRgb(l, +n[3], +n[4])); return n[5] ? `rgba(${r},${g},${b},${n[5]})` : toHex([r, g, b], 1);
  });
  return out + tail;
}
let files = 0;
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (e.name === 'node_modules' || e.name.startsWith('.')) continue; const p = path.join(d, e.name); const rel = path.relative(ROOT, p);
  if (e.isDirectory()) walk(p); else if (/\.(tsx?|css)$/.test(e.name) && !/\.test\./.test(e.name) && !MINT_ALLOW.some((r) => r.test(rel))) { const s = fs.readFileSync(p, 'utf8'), o = fix(s); if (o !== s) { fs.writeFileSync(p, o); files++; } } } })(ROOT + '/app'), walk(ROOT + '/components'), walk(ROOT + '/lib');
function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (e.name === 'node_modules' || e.name.startsWith('.')) continue; const p = path.join(d, e.name); const rel = path.relative(ROOT, p);
  if (e.isDirectory()) walk(p); else if (/\.(tsx?|css)$/.test(e.name) && !/\.test\./.test(e.name) && !MINT_ALLOW.some((r) => r.test(rel))) { const s = fs.readFileSync(p, 'utf8'), o = fix(s); if (o !== s) { fs.writeFileSync(p, o); files++; } } } }
console.log('codemod-neutral: files changed', files);
