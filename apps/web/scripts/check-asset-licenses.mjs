#!/usr/bin/env node
// Fails CI if a landing-page asset, font, or JS library has no entry in docs/ASSETS-LICENSES.md.
// An "entry" = the identifier appears inside backticks in the doc.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const web = join(dirname(fileURLToPath(import.meta.url)), '..');
const doc = readFileSync(join(web, '../../docs/ASSETS-LICENSES.md'), 'utf8');
const entries = new Set([...doc.matchAll(/`([^`\n]+)`/g)].map((m) => m[1].trim()));
const roots = ['components/landing', 'app/page.tsx', 'app/fonts.ts'].map((p) => join(web, p)).filter(existsSync);
const files = [];
const walk = (p) => (statSync(p).isDirectory() ? readdirSync(p).forEach((f) => walk(join(p, f))) : /\.(tsx?|css|mjs|js)$/.test(p) && files.push(p));
roots.forEach(walk);
const need = new Map();
const add = (id, f) => need.set(id, f.replace(web + '/', ''));
for (const f of files) {
  const s = readFileSync(f, 'utf8');
  for (const m of s.matchAll(/from\s+['"]([^'".][^'"]*)['"]/g)) {
    const pkg = m[1].startsWith('@/') ? null : m[1].startsWith('@') ? m[1].split('/').slice(0, 2).join('/') : m[1].split('/')[0];
    if (pkg) add(pkg, f);
  }
  for (const m of s.matchAll(/https?:\/\/[^\s'"`)?]+/g)) if (/\.(png|jpe?g|webp|avif|gif|svg|mp4|webm|mp3|woff2?)$|images\.|cdn|photo-/i.test(m[0])) add(m[0], f);
  for (const m of s.matchAll(/['"(](\/[\w\-./]+\.(?:png|jpe?g|webp|avif|gif|svg|mp4|webm|mp3|woff2?))['")]/g)) add(m[1], f);
  if (f.endsWith('fonts.ts')) for (const m of s.matchAll(/^export const \w+ = (\w+)\(/gm)) add(`font:${m[1]}`, f);
}
const missing = [...need].filter(([id]) => !entries.has(id));
if (missing.length) {
  console.error('ASSETS-LICENSES: missing license entries in docs/ASSETS-LICENSES.md:');
  for (const [id, f] of missing) console.error(`  - \`${id}\`  (used in ${f})`);
  process.exit(1);
}
console.log(`ASSETS-LICENSES: ${need.size} landing assets/fonts/libs documented.`);
