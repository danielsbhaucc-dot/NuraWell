#!/usr/bin/env node
// Packs one module into a versioned tarball (npm pack) for cross-repo sharing via a GitHub Release. Free; no registry.
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, findModules, validateModule } from './lib.mjs';
const id = process.argv[2];
const mods = findModules();
const m = mods.find((x) => x.json.id === id);
if (!m) { console.error(`unknown module ${id}`); process.exit(1); }
const errs = validateModule(m, mods);
if (errs.length) { console.error(errs.join('\n')); process.exit(1); }
const out = join(ROOT, 'dist/modules');
mkdirSync(out, { recursive: true });
const file = execFileSync('npm', ['pack', '--pack-destination', out], { cwd: join(ROOT, m.dir), encoding: 'utf8' }).trim().split('\n').pop();
console.log(`${join(out, file)}\ntag: mod/${m.json.id}@${m.json.version}`);
