import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Guard against the Oct 2026 Hobby-quota incident: ~280 retained deployments (mostly automatic
// feature-branch previews) filled the 10 GB Function Storage quota. Keep previews opt-in.
const root = path.resolve(__dirname, '../../..');
const script = path.join(root, 'scripts/vercel-ignore-build.sh');
const exitCode = (env: Record<string, string>) => {
  try {
    execFileSync('bash', [script], { env: { PATH: process.env.PATH ?? '', ...env }, cwd: root, stdio: 'ignore' });
    return 0;
  } catch (e) {
    return (e as { status?: number }).status ?? -1;
  }
};

describe('vercel cost guard', () => {
  it('git auto-deploys only main (all other branches, including ones with slashes, are off)', () => {
    const cfg = JSON.parse(readFileSync(path.join(root, 'apps/web/vercel.json'), 'utf8'));
    expect(cfg.git.deploymentEnabled.main).toBe(true);
    expect(cfg.git.deploymentEnabled['**']).toBe(false);
    expect(cfg.ignoreCommand).toContain('vercel-ignore-build.sh');
  });

  it('skips automatic previews of feature branches', () => {
    expect(exitCode({ VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_REF: 'feat/something' })).toBe(0);
    expect(exitCode({ VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_REF: 'dependabot/npm/x' })).toBe(0);
  });

  it('crons stay daily or rarer (each extra run costs Active CPU)', () => {
    const cfg = JSON.parse(readFileSync(path.join(root, 'apps/web/vercel.json'), 'utf8'));
    for (const c of cfg.crons ?? []) {
      const [min, hour] = String(c.schedule).split(/\s+/);
      expect(min, c.path).toMatch(/^\d+$/);
      expect(hour, c.path).toMatch(/^\d+$/);
    }
  });
});
