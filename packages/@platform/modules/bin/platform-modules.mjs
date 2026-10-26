#!/usr/bin/env node
// `npx @platform/modules <command> ...` -> scripts/modules/<command>.mjs
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
const [cmd, ...rest] = process.argv.slice(2);
const ok = ['new', 'list', 'index', 'check', 'pack', 'install', 'verify', 'boundaries'];
if (!ok.includes(cmd)) { console.error(`usage: platform-modules <${ok.join('|')}> ...`); process.exit(1); }
const script = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'scripts', 'modules', `${cmd}.mjs`);
if (!existsSync(script)) { console.error(`missing ${script}`); process.exit(1); }
process.exit(spawnSync(process.execPath, [script, ...rest], { stdio: 'inherit' }).status ?? 1);
