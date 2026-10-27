#!/usr/bin/env node
// App-area modules: one manifest per catalog module at modules/<id>/module.json (+ README.he.md + llms.txt).
// An area module OWNS app files in place (path prefixes; the longest prefix wins). Owned files are modular:
// they are gated by the module, documented, and leave the legacy list. Moving code into packages comes later
// and is behavior-identical by construction (owned paths only, no logic edits).
// Usage: node scripts/modules/areas.mjs   (CI: validates every manifest)
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { ROOT } from './lib.mjs';

export const REQUIRED_ALWAYS_ON = ['consents', 'trusted-device', 'nightly-scan'];
const TIERS = ['internal', 'shareable', 'sellable'];
const AREA_REQUIRED = ['id', 'name', 'kind', 'distribution', 'category', 'core', 'toggleable', 'alwaysOn', 'owns', 'description'];

export function catalogFlags(root = ROOT) {
  const src = readFileSync(join(root, 'apps/web/lib/platform/catalog.ts'), 'utf8');
  return new Map([...src.matchAll(/\{ id: '([a-z0-9-]+)', name: '([^']+)', core: (true|false)(, essential: true)?/g)]
    .map((m) => [m[1], { name: m[2], core: m[3] === 'true', essential: !!m[4] }]));
}

export function findAreas(root = ROOT) {
  const dir = join(root, 'modules');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((d) => existsSync(join(dir, d, 'module.json')))
    .map((d) => ({ dir: `modules/${d}`, json: JSON.parse(readFileSync(join(dir, d, 'module.json'), 'utf8')) }))
    .sort((a, b) => a.json.id.localeCompare(b.json.id));
}

/** Owning area id for a repo path (longest matching prefix), or null. */
export function ownerOf(file, areas) {
  let best = null, len = 0;
  for (const a of areas) for (const p of a.json.owns ?? []) {
    const hit = p.endsWith('/') ? file.startsWith(p) : file === p;
    if (hit && p.length > len) { best = a.json.id; len = p.length; }
  }
  return best;
}

export function validateAreas(areas, cat, files) {
  const e = [];
  const ids = new Set(areas.map((a) => a.json.id));
  for (const id of cat.keys()) if (!ids.has(id)) e.push(`catalog module "${id}" has no modules/${id}/module.json`);
  for (const { dir, json: j } of areas) {
    for (const k of AREA_REQUIRED) if (!(k in j)) e.push(`${dir}: missing "${k}"`);
    if (dir !== `modules/${j.id}`) e.push(`${dir}: folder must be modules/${j.id}`);
    const c = cat.get(j.id);
    if (!c) { e.push(`${dir}: "${j.id}" is not in the catalog`); continue; }
    if (j.kind !== 'area') e.push(`${dir}: kind must be "area"`);
    if (!TIERS.includes(j.distribution)) e.push(`${dir}: distribution must be internal|shareable|sellable`);
    if (j.core !== c.core) e.push(`${dir}: core must match the catalog (${c.core})`);
    if ((c.core || ['security', 'privacy'].includes(j.category)) && j.toggleable !== false) e.push(`${dir}: core/security/privacy modules must be toggleable:false`);
    if (j.alwaysOn?.length && j.toggleable !== false) e.push(`${dir}: a module with always-on features must be toggleable:false`);
    for (const f of ['README.he.md', 'llms.txt']) {
      const p = join(ROOT, dir, f);
      if (!existsSync(p) || readFileSync(p, 'utf8').trim().length < 80) e.push(`${dir}: missing or empty ${f}`);
    }
    for (const p of j.owns ?? []) if (!files.some((f) => (p.endsWith('/') ? f.startsWith(p) : f === p))) e.push(`${dir}: owns "${p}" but no tracked file matches`);
  }
  for (const feat of REQUIRED_ALWAYS_ON) {
    const holders = areas.filter((a) => a.json.alwaysOn?.includes(feat));
    if (!holders.length) e.push(`always-on feature "${feat}" is not declared by any module`);
    for (const h of holders) { const c = cat.get(h.json.id); if (!c?.core && !c?.essential) e.push(`"${feat}" lives in ${h.json.id}, which must be core or essential in the catalog`); }
  }
  return e;
}

export function trackedAppFiles(root = ROOT) {
  return execFileSync('git', ['ls-files', 'apps'], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const errors = validateAreas(findAreas(), catalogFlags(), trackedAppFiles());
  if (errors.length) { console.error('✖ area modules:\n  ' + errors.join('\n  ')); process.exit(1); }
  console.log(`area modules: OK (${findAreas().length})`);
}
