import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('design guard', () => {
  it('adds no new white / raw-color / raw-button debt (see DESIGN_SYSTEM.md)', () => {
    const script = path.resolve(__dirname, '../scripts/design-lint.mjs');
    let out = '';
    try {
      out = execFileSync(process.execPath, [script], { encoding: 'utf8', stdio: 'pipe' });
    } catch (e) {
      const err = e as { stderr?: string; stdout?: string };
      throw new Error(String(err.stderr || err.stdout || e));
    }
    expect(out).toContain('no new debt');
  });
});
