#!/usr/bin/env node
// Restore helper for the nightly logical backup (nurawell-logical-*.jsonl.gz.age).
// Usage: age -d -i ~/offline/db-backup.key FILE.age | node scripts/backup/logical-restore.mjs > restore.sql
//        then on an EMPTY database that already has the schema (supabase db reset / migrations):
//        psql "$TARGET_DB_URL" -v ON_ERROR_STOP=1 -1 -f restore.sql
// Reads gzip JSONL from stdin, writes SQL to stdout. Prints only counts to stderr. Never touches prod by itself.
import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { randomBytes } from 'node:crypto';
const q = (s) => '"' + String(s).replace(/"/g, '""') + '"';
const rl = createInterface({ input: process.stdin.pipe(createGunzip()), crlfDelay: Infinity });
let manifest = null; let rows = 0;
process.stdout.write('set session_replication_role = replica;\n');
for await (const line of rl) {
  if (!line) continue;
  const o = JSON.parse(line);
  if (!manifest) { manifest = o; if (o.format !== 'logical-jsonl-v1') throw new Error('unknown format'); continue; }
  const tag = '$r' + randomBytes(6).toString('hex') + '$';
  const json = JSON.stringify(o.rows);
  if (json.includes(tag)) throw new Error('tag collision');
  process.stdout.write(`insert into ${q(o.s)}.${q(o.t)} select * from jsonb_populate_recordset(null::${q(o.s)}.${q(o.t)}, ${tag}${json}${tag}::jsonb);\n`);
  rows += o.rows.length;
}
process.stdout.write('set session_replication_role = origin;\n');
const expected = manifest.tables.reduce((a, t) => a + t.rows, 0);
console.error(`backup ${manifest.created_at}: ${manifest.tables.length} tables, ${rows} rows (manifest: ${expected})`);
if (rows !== expected) process.exit(2);
