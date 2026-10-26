#!/usr/bin/env node
// Validates every module.json + its docs, dependency graph, app-coupling rules. Exit 1 on any error.
import { findModules, validateModule, validateStorePage, dependencyOrder } from './lib.mjs';
const mods = findModules();
let bad = 0;
const ids = new Set();
for (const m of mods) {
  if (ids.has(m.json.id)) { console.error(`✗ duplicate module id ${m.json.id}`); bad++; }
  ids.add(m.json.id);
  const errs = [...validateModule(m, mods), ...validateStorePage(m)];
  if (errs.length) { bad++; console.error(`✗ ${m.json.id} (${m.dir})\n  - ${errs.join('\n  - ')}`); }
  else console.log(`✓ ${m.json.id}@${m.json.version}`);
}
try { dependencyOrder(mods); } catch (e) { console.error(`✗ ${e.message}`); bad++; }
if (!mods.length) { console.error('✗ no modules found'); bad++; }
process.exit(bad ? 1 : 0);
