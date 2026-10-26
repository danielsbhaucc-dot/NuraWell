#!/usr/bin/env node
// Copies a module (and its required modules, in dependency order) into another repo:
//   node scripts/modules/install.mjs <id> --target <repo> [--dry-run]
// - copies packages/<scope>/<name> verbatim (incl. module.json, docs, tests)
// - copies owned migrations into <target>/supabase/migrations with prefix mod_<id>_ (never renumbers the target's own)
// - prints the manifest line to add and the env NAMES the target must provide (never values)
// Never overwrites an existing module of a higher/equal version; never deletes anything in the target.
import { cpSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { ROOT, findModules, validateModule, dependencyOrder } from './lib.mjs';

const args = process.argv.slice(2);
const id = args[0];
const target = args[args.indexOf('--target') + 1];
const dry = args.includes('--dry-run');
if (!id || !args.includes('--target') || !target) { console.error('usage: install.mjs <id> --target <repo> [--dry-run]'); process.exit(2); }
const mods = findModules();
const want = new Set();
const add = (x) => { const m = mods.find((y) => y.json.id === x); if (!m) throw new Error(`unknown module ${x}`); if (want.has(x)) return; want.add(x); Object.keys(m.json.requires?.modules ?? {}).forEach(add); };
add(id);
const plan = dependencyOrder(mods.filter((m) => want.has(m.json.id)));
const semver = (v) => v.split('.').map(Number);
const gte = (a, b) => { const [x, y] = [semver(a), semver(b)]; for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i]; return true; };
const envNeeded = new Set();
for (const m of plan) {
  const errs = validateModule(m, mods);
  if (errs.length) { console.error(`refusing: ${m.json.id} fails check:\n  ${errs.join('\n  ')}`); process.exit(1); }
  const dest = join(target, m.dir);
  const existing = join(dest, 'module.json');
  if (existsSync(existing) && gte(JSON.parse(readFileSync(existing, 'utf8')).version, m.json.version)) { console.log(`= ${m.json.id} already at same/newer version, skipped`); continue; }
  console.log(`${dry ? '[dry] ' : ''}+ ${m.json.id}@${m.json.version} -> ${dest}`);
  if (!dry) { mkdirSync(dest, { recursive: true }); cpSync(join(ROOT, m.dir), dest, { recursive: true, filter: (s) => !s.includes('node_modules') }); }
  for (const mig of m.json.migrations ?? []) {
    const src = existsSync(join(ROOT, m.dir, mig)) ? join(ROOT, m.dir, mig) : join(ROOT, 'supabase/migrations', mig);
    const to = join(target, 'supabase/migrations', `mod_${m.json.id.replace(/-/g, '_')}_${basename(mig)}`);
    console.log(`${dry ? '[dry] ' : ''}  migration -> ${to}`);
    if (!dry) { mkdirSync(join(target, 'supabase/migrations'), { recursive: true }); if (!existsSync(to)) cpSync(src, to); }
  }
  (m.json.env ?? []).forEach((n) => envNeeded.add(n));
}
console.log(`\nAdd to the product manifest:  modules: { '${id}': { enabled: true } }`);
console.log(`Add workspace dep: "${plan.at(-1).json.package}": "*"  (and transpilePackages for Next.js)`);
console.log(envNeeded.size ? `Env NAMES to provide (values via your secret store): ${[...envNeeded].join(', ')}` : 'Env: none required.');
console.log('Then run: node scripts/modules/verify.mjs');
