import { it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

// Detection on push: CI fails when media changed and the provenance manifest was not regenerated.
it('repo media manifest is up to date', () => {
  const r = spawnSync('node', ['scripts/media-provenance-scan.mjs', '--check'], { cwd: path.resolve(__dirname, '../../..'), encoding: 'utf8' });
  expect(r.stderr + r.stdout).toContain('up to date');
}, 60_000);
