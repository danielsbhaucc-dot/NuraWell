#!/usr/bin/env node
import { findModules, dependencyOrder } from './lib.mjs';
for (const m of dependencyOrder(findModules())) {
  const j = m.json;
  console.log(`${j.id.padEnd(22)} ${j.version.padEnd(8)} ${j.distribution.padEnd(10)} ${(j.toggleable ? 'toggle' : 'always-on').padEnd(10)} ${m.dir}`);
}
