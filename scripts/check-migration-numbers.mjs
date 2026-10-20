// Fails CI when two migration files share a numeric prefix. Prod tracks migrations by apply
// timestamp, so file numbers are only for ordering/readability, but they must be unique going forward.
// Historical duplicates (all applied long ago) are grandfathered below; do not add to this list.
import { readdirSync } from 'node:fs';
const GRANDFATHERED = new Set(['000042', '000144', '000146', '000148', '000149', '000151']);
const files = readdirSync(new URL('../supabase/migrations/', import.meta.url)).filter((f) => f.endsWith('.sql'));
const by = new Map();
for (const f of files) { const n = f.match(/^(\d+)_/)?.[1]; if (!n) { console.error(`bad migration name: ${f}`); process.exit(1); } by.set(n, [...(by.get(n) ?? []), f]); }
const dup = [...by].filter(([n, fs]) => fs.length > 1 && !GRANDFATHERED.has(n));
if (dup.length) { for (const [n, fs] of dup) console.error(`duplicate migration number ${n}: ${fs.join(', ')}`); process.exit(1); }
console.log(`migrations ok (${files.length} files)`);
