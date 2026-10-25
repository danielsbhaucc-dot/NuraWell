import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** CI guard: every admin/ops API route must go through a server-side admin (or machine-secret) guard. */
const ROOTS = ['app/api/v1/admin', 'app/api/v1/ops'];
const GUARDS = /requireOpsApiAdmin\(|requireApiAdmin\(|authorizeCronRequest\(|authorizeDbBackupRequest\(/;

function routes(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? routes(p) : n === 'route.ts' ? [p] : [];
  });
}

describe('admin API guard coverage', () => {
  const files = ROOTS.flatMap((r) => routes(join(__dirname, '..', r)));
  it('finds routes', () => expect(files.length).toBeGreaterThan(50));
  it.each(files)('%s is guarded server-side', (f) => {
    expect(readFileSync(f, 'utf8')).toMatch(GUARDS);
  });
  it('requireApiAdmin writes the access log for every method', () => {
    const src = readFileSync(join(__dirname, '..', 'lib/api/route-guards.ts'), 'utf8');
    expect(src).toMatch(/await auditAdminApiAccess\(request, user\.id\)/);
  });
});
