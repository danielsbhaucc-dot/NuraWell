#!/usr/bin/env node
// Build-time snapshot of installed production packages (from package-lock.json) for the nightly
// security monitor (OSV.dev). Output: apps/web/lib/generated/deps-snapshot.json. No network.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'));
const seen = new Map();
for (const [p, v] of Object.entries(lock.packages ?? {})) {
  if (!p.includes('node_modules/') || v.dev || v.link || !v.version) continue;
  const name = v.name ?? p.slice(p.lastIndexOf('node_modules/') + 13);
  seen.set(`${name}@${v.version}`, { name, version: v.version });
}
const deps = [...seen.values()].sort((a, b) => (a.name + a.version).localeCompare(b.name + b.version));
const out = join(root, 'apps/web/lib/generated/deps-snapshot.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ deps }) + '\n');
console.log(`deps snapshot: ${deps.length} packages`);
