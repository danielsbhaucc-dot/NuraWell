import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Runs in the "Web tests" CI job: fails on duplicate migration numbers.
describe('supabase migrations', () => {
  it('have unique numeric prefixes', () => {
    const out = execFileSync('node', [resolve(__dirname, '../../../scripts/check-migration-numbers.mjs')], { encoding: 'utf8' });
    expect(out).toContain('migrations ok');
  });
});
