import { cpSync, existsSync, rmSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const webRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(webRoot, '..', '..');
const src = join(repoRoot, 'kabel-buddy');
const dest = join(webRoot, 'public', 'kabel-buddy');

if (!existsSync(src)) {
  console.warn('[sync-kabel-buddy] source missing, skipping');
  process.exit(0);
}

if (existsSync(dest)) {
  rmSync(dest, { recursive: true, force: true });
}

cpSync(src, dest, { recursive: true });
console.log('[sync-kabel-buddy] synced to public/kabel-buddy');
