#!/usr/bin/env node
// Installs platform-core packages into a product as workspace packages (packages/@core/<name>), pinned to a commit.
// Usage (in the product repo):  node scripts/core-sync.mjs <sha> pkg1 pkg2 ...   → fetch via `gh api` (read access to platform-core)
//                               node scripts/core-sync.mjs --check               → CI: fail if any installed file was edited locally
// Writes packages/@core/core-lock.json { repo, sha, files: { path: sha256 } }. Never edit installed files; fix in platform-core and re-sync.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
const REPO = 'danielsbhaucc-dot/platform-core', ROOT = 'packages/@core', LOCK = join(ROOT, 'core-lock.json');
const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const args = process.argv.slice(2);
if (args[0] === '--check') {
  const lock = JSON.parse(readFileSync(LOCK, 'utf8')); let bad = 0;
  for (const [p, h] of Object.entries(lock.files)) { const f = join(ROOT, p); if (!existsSync(f) || sha256(readFileSync(f)) !== h) { console.error(`drift: ${f}`); bad++; } }
  if (bad) process.exit(1); console.log(`core-sync: ${Object.keys(lock.files).length} files match platform-core@${lock.sha.slice(0, 7)}`); process.exit(0);
}
const [sha, ...pkgs] = args; if (!/^[0-9a-f]{40}$/.test(sha ?? '') || !pkgs.length) { console.error('usage: core-sync <40-hex sha> <pkg...> | --check'); process.exit(2); }
const gh = (path) => execFileSync('gh', ['api', path], { encoding: 'utf8', maxBuffer: 64 << 20 });
const tree = JSON.parse(gh(`repos/${REPO}/git/trees/${sha}?recursive=1`)).tree;
const files = {};
for (const pkg of pkgs) {
  rmSync(join(ROOT, pkg), { recursive: true, force: true });
  for (const t of tree.filter((x) => x.type === 'blob' && x.path.startsWith(`packages/${pkg}/`))) {
    const buf = Buffer.from(JSON.parse(gh(`repos/${REPO}/git/blobs/${t.sha}`)).content, 'base64');
    const rel = t.path.slice('packages/'.length); mkdirSync(dirname(join(ROOT, rel)), { recursive: true }); writeFileSync(join(ROOT, rel), buf); files[rel] = sha256(buf);
  }
}
const prev = existsSync(LOCK) ? JSON.parse(readFileSync(LOCK, 'utf8')).files : {};
for (const k of Object.keys(prev)) if (!pkgs.some((p) => k.startsWith(`${p}/`))) files[k] = prev[k];
writeFileSync(LOCK, JSON.stringify({ repo: REPO, sha, files: Object.fromEntries(Object.entries(files).sort()) }, null, 2) + '\n');
console.log(`core-sync: installed ${pkgs.join(', ')} @ ${sha.slice(0, 7)}`);
