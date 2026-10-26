// Daniel's rule: no white or near-white anywhere in the platform packages or the module hub.
// Fails on #fff / #ffffff / white / rgb(255,255,255) / rgba(255,255,255,…) or any hex colour whose RGB channels are all >= 0xF3. Comments are ignored.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(__dirname, '..', '..', '..');
const DIRS = ['packages/@platform', 'apps/web/app/ops/modules'];
const EXT = /\.(css|tsx?|mts)$/;

function walk(d: string, out: string[] = []) {
  for (const n of readdirSync(d)) {
    if (n === 'node_modules' || n === 'dist' || n.endsWith('.generated.json')) continue;
    const p = join(d, n);
    if (statSync(p).isDirectory()) walk(p, out); else if (EXT.test(n)) out.push(p);
  }
  return out;
}
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:'"`\\])\/\/[^\n]*/g, (m, a) => a + ' '.repeat(m.length - a.length));

export function whiteHits(src: string): string[] {
  const s = stripComments(src);
  const hits: string[] = [];
  for (const m of s.matchAll(/#([0-9a-f]{3,8})\b/gi)) {
    const h = m[1];
    if (![3, 4, 6, 8].includes(h.length)) continue;
    const full = h.length <= 4 ? h.slice(0, 3).split('').map((c) => c + c).join('') : h.slice(0, 6);
    const ch = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
    if (ch.every((v) => v >= 0xf3)) hits.push(m[0]);
  }
  for (const m of s.matchAll(/rgba?\(\s*255\s*,\s*255\s*,\s*255\b|(?<![\w-])white(?![\w-])/gi)) hits.push(m[0]);
  return hits;
}

describe('no white surfaces (platform packages + module hub)', () => {
  it('detector works', () => {
    expect(whiteHits('a{color:#fff}')).toEqual(['#fff']);
    expect(whiteHits('a{background:#F7FBF4}')).toEqual(['#F7FBF4']);
    expect(whiteHits('a{background:#f2f2f6;border:1px solid #ffffff59}')).toEqual(['#ffffff59']);
    expect(whiteHits("x = 'rgba(255, 255, 255, .4)'")).toHaveLength(1);
    expect(whiteHits('/* no #fff here */ a{color:#1d1d1f;white-space:nowrap}')).toEqual([]);
  });
  it('no file contains white or near-white', () => {
    const bad: string[] = [];
    for (const d of DIRS) for (const f of walk(join(ROOT, d))) { const h = whiteHits(readFileSync(f, 'utf8')); if (h.length) bad.push(`${relative(ROOT, f)}: ${h.join(', ')}`); }
    expect(bad).toEqual([]);
  });
});
