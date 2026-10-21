#!/usr/bin/env node
// Fails if any file under the landing-v2 assets dir lacks a row in ASSETS-LICENSES.md
// or if its row is not marked commercial OK = yes.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = process.cwd();
const ASSET_DIR = 'apps/web/public/landing-v2';
const IGNORE = new Set(['.gitkeep', '.DS_Store']);

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return walk(p);
    return IGNORE.has(n) ? [] : [relative(ROOT, p).split(sep).join('/')];
  });
}

const rows = new Map();
for (const line of readFileSync(join(ROOT, 'ASSETS-LICENSES.md'), 'utf8').split('\n')) {
  if (!line.trim().startsWith('|')) continue;
  const c = line.split('|').slice(1, -1).map((s) => s.trim());
  if (c.length < 8 || c[1] === 'path' || /^-+$/.test(c[1])) continue;
  rows.set(c[1].replace(/^`|`$/g, ''), { commercial: c[4].toLowerCase(), source: c[2], license: c[3] });
}

const errors = [];
for (const f of walk(join(ROOT, ASSET_DIR))) {
  const r = rows.get(f);
  if (!r) errors.push(`missing row: ${f}`);
  else if (r.commercial !== 'yes') errors.push(`commercial OK != yes: ${f}`);
  else if (!r.source || !r.license) errors.push(`missing source/license: ${f}`);
}
if (errors.length) {
  console.error('ASSETS-LICENSES check failed:\n' + errors.join('\n'));
  process.exit(1);
}
console.log(`ASSETS-LICENSES OK (${ASSET_DIR})`);
