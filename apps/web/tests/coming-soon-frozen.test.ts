import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Hard rule: the coming-soon (pre-launch) screen is frozen to origin/main.
 * Design branches must not change its files. Fails if any of them differ from main.
 * Skips when origin/main is not available (e.g. shallow CI checkout without the ref).
 */
const FROZEN = [
  'apps/web/app/coming-soon',
  'apps/web/components/coming-soon',
  'apps/web/components/admin/AdminComingSoonPanel.tsx',
  'apps/web/components/admin/AdminComingSoonLyricsEditor.tsx',
  'apps/web/components/admin/AdminComingSoonRevolutionEditor.tsx',
];

function git(args: string[]): string {
  return execFileSync('git', args, { cwd: path.resolve(__dirname, '..'), encoding: 'utf8' }).trim();
}

function hasMainRef(): boolean {
  try {
    git(['rev-parse', '--verify', '--quiet', 'origin/main']);
    return true;
  } catch {
    return false;
  }
}

const root = (() => {
  try {
    return git(['rev-parse', '--show-toplevel']);
  } catch {
    return '';
  }
})();

describe.skipIf(!root || !hasMainRef())('coming-soon frozen to main', () => {
  it('has no diff against origin/main in coming-soon files', () => {
    const out = execFileSync('git', ['diff', '--name-only', 'origin/main', '--', ...FROZEN], {
      cwd: root,
      encoding: 'utf8',
    }).trim();
    expect(out, `coming-soon files changed vs main:\n${out}`).toBe('');
  });
});
