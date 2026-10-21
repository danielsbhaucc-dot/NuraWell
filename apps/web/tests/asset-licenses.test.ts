import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

// Runs in the existing "Web tests" CI job: fails if any file under
// apps/web/public/landing-v2/ lacks a commercial-OK row in ASSETS-LICENSES.md.
describe('landing-v2 asset licenses', () => {
  it('every asset has a row in ASSETS-LICENSES.md', () => {
    const root = resolve(__dirname, '../../..');
    const r = spawnSync(process.execPath, ['scripts/check-asset-licenses.mjs'], { cwd: root, encoding: 'utf8' });
    expect(r.stderr + r.stdout).toContain('ASSETS-LICENSES OK');
    expect(r.status).toBe(0);
  });
});
