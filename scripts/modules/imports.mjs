#!/usr/bin/env node
// Module import boundaries (zero-dependency, same rules as eslint-plugin-boundaries "element-types" + "entry-point").
// Rules:
//   1. Importing a CORE module's files is allowed: core is the platform API (like WordPress core).
//   2. Importing a NON-core module from another module is allowed only through that module's public API:
//      the files listed in its module.json "api" (files, or a folder ending in "/" such as apps/web/lib/module-api/<id>/). Anything else is an internal import.
//   3. Existing violations live in modules/import-baseline.txt. The baseline may only shrink: a new
//      violation fails CI, and a fixed one must be removed from the file (so the count never climbs back).
// Reads sources from git (works in sparse checkouts). Usage:
//   node scripts/modules/imports.mjs            check
//   node scripts/modules/imports.mjs --write    rewrite the baseline (only allowed to drop lines in CI)
//   node scripts/modules/imports.mjs --report   per-module counts
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, posix } from 'node:path';
import { ROOT } from './lib.mjs';
import { findAreas, ownerOf } from './areas.mjs';

const BASELINE = 'modules/import-baseline.txt';
const EXT = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const TRY = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '/index.ts', '/index.tsx', '/index.js'];

export function sources(root = ROOT) {
  const files = execFileSync('git', ['ls-files', 'apps'], { cwd: root, encoding: 'utf8' }).split('\n').filter((f) => EXT.test(f));
  const out = execFileSync('git', ['cat-file', '--batch'], { cwd: root, input: files.map((f) => `HEAD:${f}`).join('\n') + '\n', maxBuffer: 1 << 30 });
  const map = new Map(); let i = 0, pos = 0;
  while (pos < out.length && i < files.length) {
    const nl = out.indexOf(10, pos); const head = out.slice(pos, nl).toString().split(' ');
    if (head[1] === 'missing') { pos = nl + 1; i++; continue; }
    const size = +head[2]; const f = files[i++];
    // working-tree copy wins when present (local edits), else the committed blob
    const p = join(root, f);
    map.set(f, existsSync(p) ? readFileSync(p, 'utf8') : out.slice(nl + 1, nl + 1 + size).toString());
    pos = nl + 1 + size + 1;
  }
  return map;
}

const SPEC = /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|require\(\s*['"]([^'"]+)['"]\s*\)|^\s*import\s*['"]([^'"]+)['"]/gm;

export function resolve(from, spec, files) {
  const app = from.split('/').slice(0, 2).join('/');
  let base;
  if (spec.startsWith('@/')) base = `${app}/${spec.slice(2)}`;
  else if (spec.startsWith('.')) base = posix.normalize(posix.join(posix.dirname(from), spec));
  else return null;
  for (const t of TRY) if (files.has(base + t)) return base + t;
  return null;
}

export function violations(src = sources(), areas = findAreas()) {
  const byId = new Map(areas.map((a) => [a.json.id, a.json]));
  const v = new Set();
  for (const [from, code] of src) {
    const fm = ownerOf(from, areas); if (!fm) continue;
    for (const m of code.matchAll(SPEC)) {
      const to = resolve(from, m[1] ?? m[2] ?? m[3] ?? m[4], src); if (!to) continue;
      const tm = ownerOf(to, areas);
      if (!tm || tm === fm) continue;
      const t = byId.get(tm);
      if (t.core) continue;
      if ((t.api ?? []).some((a) => (a.endsWith('/') ? to.startsWith(a) : a === to))) continue;
      v.add(`${fm} -> ${tm} | ${from} -> ${to}`);
    }
  }
  return [...v].sort();
}

export function readBaseline(root = ROOT) {
  const p = join(root, BASELINE);
  return existsSync(p) ? readFileSync(p, 'utf8').split('\n').filter((l) => l && !l.startsWith('#')) : [];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const now = violations();
  if (process.argv.includes('--report')) {
    const c = {}; for (const l of now) { const k = l.split(' | ')[0]; c[k] = (c[k] ?? 0) + 1; }
    for (const [k, n] of Object.entries(c).sort((a, b) => b[1] - a[1])) console.log(String(n).padStart(4), k);
    console.log(`total: ${now.length}`); process.exit(0);
  }
  if (process.argv.includes('--write')) {
    writeFileSync(join(ROOT, BASELINE), `# Cross-module internal imports that predate the boundary check. May only shrink.\n# Format: <from-module> -> <to-module> | <file> -> <imported file>\n${now.join('\n')}\n`);
    console.log(`baseline written: ${now.length}`); process.exit(0);
  }
  const base = new Set(readBaseline());
  const added = now.filter((l) => !base.has(l));
  const fixed = [...base].filter((l) => !now.includes(l));
  if (added.length) console.error(`✖ new cross-module internal imports (use the module's public API in module.json "api"):\n  ${added.join('\n  ')}`);
  if (fixed.length) console.error(`✖ fixed violations still listed in ${BASELINE}; remove them (run --write):\n  ${fixed.join('\n  ')}`);
  if (added.length || fixed.length) process.exit(1);
  console.log(`import boundaries: OK (${now.length} baseline violations, shrink-only)`);
}
