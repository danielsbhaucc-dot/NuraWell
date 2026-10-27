#!/usr/bin/env node
// Library convention lint: every packages/<scope>/<name> with a module.json follows one layout.
import { readdirSync, existsSync, readFileSync } from 'node:fs';
const REQ = ['package.json', 'module.json', 'src/index.ts', 'README.he.md', 'llms.txt', 'CHANGELOG.md'];
const EXEMPT = new Set(['packages/@platform/modules', 'packages/billing']); // CLI tool / legacy package, documented in LIBRARY.md
const dirs = [];
for (const s of readdirSync('packages')) {
  if (s.startsWith('@')) for (const n of readdirSync(`packages/${s}`)) dirs.push(`packages/${s}/${n}`);
  else dirs.push(`packages/${s}`);
}
const errs = []; const ids = new Map();
for (const d of dirs) {
  if (EXEMPT.has(d) || !existsSync(`${d}/package.json`)) continue;
  for (const f of REQ) if (!existsSync(`${d}/${f}`)) errs.push(`${d}: missing ${f}`);
  if (!existsSync(`${d}/module.json`)) continue;
  const m = JSON.parse(readFileSync(`${d}/module.json`, 'utf8')); const p = JSON.parse(readFileSync(`${d}/package.json`, 'utf8'));
  if (m.id !== d.split('/').pop()) errs.push(`${d}: module.json id "${m.id}" must equal folder name`);
  if (m.package !== p.name) errs.push(`${d}: module.json package must equal package.json name`);
  if (m.version !== p.version) errs.push(`${d}: module.json version ${m.version} != package.json ${p.version}`);
  if (existsSync(`${d}/CHANGELOG.md`) && !readFileSync(`${d}/CHANGELOG.md`, 'utf8').includes(m.version)) errs.push(`${d}: CHANGELOG.md has no entry for ${m.version}`);
  if (ids.has(m.id)) errs.push(`${d}: duplicate module id "${m.id}" (also ${ids.get(m.id)})`); ids.set(m.id, d);
}
if (errs.length) { console.error('✖ library convention:\n  ' + errs.join('\n  ')); process.exit(1); }
console.log(`library convention: OK (${ids.size} modules)`);
