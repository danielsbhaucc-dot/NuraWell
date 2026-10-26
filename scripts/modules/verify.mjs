#!/usr/bin/env node
// Adoption check for CI: module metadata valid, generated docs fresh, each module's tests pass.
// Fails closed: any error -> exit 1.
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { ROOT, findModules } from './lib.mjs';
const run = (cmd, a, cwd = ROOT) => execFileSync(cmd, a, { cwd, stdio: 'inherit' });
run('node', ['scripts/modules/check.mjs']);
run('node', ['scripts/modules/index.mjs', '--check']);
const tests = findModules().flatMap((m) => m.json.tests ?? []).filter((t) => t.startsWith('apps/web/'));
if (tests.length) run('npx', ['vitest', 'run', ...tests.map((t) => t.slice('apps/web/'.length))], join(ROOT, 'apps/web'));
console.log('modules verify: OK');
