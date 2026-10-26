#!/usr/bin/env node
// Regenerates modules/INDEX.md and /llms.txt from module.json files. `--check` exits 1 if they are stale.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, findModules, dependencyOrder, renderIndex, renderLlms, renderRegistry } from './lib.mjs';
const mods = dependencyOrder(findModules());
const targets = [[join(ROOT, 'modules/INDEX.md'), renderIndex(mods)], [join(ROOT, 'llms.txt'), renderLlms(mods)], [join(ROOT, 'packages/@platform/module-library-ui/src/registry.generated.json'), renderRegistry(mods)]];
let stale = false;
for (const [f, body] of targets) {
  let cur = '';
  try { cur = readFileSync(f, 'utf8'); } catch { cur = ''; }
  if (cur !== body) {
    stale = true;
    if (!process.argv.includes('--check')) writeFileSync(f, body);
  }
}
if (process.argv.includes('--check') && stale) {
  console.error('modules/INDEX.md, llms.txt or the module registry is stale. Run: node scripts/modules/index.mjs');
  process.exit(1);
}
console.log(stale && !process.argv.includes('--check') ? 'regenerated' : 'up to date');
