import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, existsSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
// @ts-expect-error plain .mjs tooling
import { scaffold } from '../../../scripts/modules/new.mjs';
// @ts-expect-error plain .mjs tooling
import { findModules, validateModule } from '../../../scripts/modules/lib.mjs';
// @ts-expect-error plain .mjs tooling
import { classify } from '../../../scripts/modules/boundaries.mjs';

const ROOT = join(__dirname, '..', '..', '..');
function fakeRepo() {
  const r = mkdtempSync(join(tmpdir(), 'modnew-'));
  mkdirSync(join(r, 'modules'), { recursive: true });
  cpSync(join(ROOT, 'modules/module.schema.json'), join(r, 'modules/module.schema.json'));
  return r;
}

describe('module-first scaffold (new)', () => {
  it('generates a module that passes validation, with tier, docs, config schema, migrations, tests and index entry', () => {
    const r = fakeRepo();
    scaffold('habit-streaks', { tier: 'sellable', root: r, description: 'Tracks daily habit streaks for a product.' });
    const d = join(r, 'packages/@platform/habit-streaks');
    for (const f of ['module.json', 'package.json', 'README.he.md', 'llms.txt', 'CHANGELOG.md', 'config.schema.json', 'src/config.ts', 'migrations/.gitkeep']) expect(existsSync(join(d, f)), f).toBe(true);
    const mj = JSON.parse(readFileSync(join(d, 'module.json'), 'utf8'));
    expect(mj.distribution).toBe('sellable');
    expect(mj.toggleable).toBe(true);
    const cfg = JSON.parse(readFileSync(join(d, 'config.schema.json'), 'utf8'));
    expect(cfg.properties.enabled.default).toBe(false);
    expect(cfg.properties.logPii.const).toBe(false);
    expect(existsSync(join(r, 'apps/web/tests/mod-habit-streaks.test.ts'))).toBe(true);
    expect(readFileSync(join(r, 'modules/INDEX.md'), 'utf8')).toContain('habit-streaks');
    expect(readFileSync(join(r, 'llms.txt'), 'utf8')).toContain('habit-streaks');
    const mods = findModules(r);
    expect(validateModule(mods[0], mods, r)).toEqual([]);
  });
  it('security modules are scaffolded always-on; bad ids, tiers and duplicates are rejected', () => {
    const r = fakeRepo();
    scaffold('audit-x', { category: 'security', root: r, description: 'Audit trail helpers for products.' });
    expect(JSON.parse(readFileSync(join(r, 'packages/@platform/audit-x/module.json'), 'utf8')).toggleable).toBe(false);
    expect(() => scaffold('audit-x', { root: r })).toThrow(/exists/);
    expect(() => scaffold('Bad_Id', { root: r })).toThrow(/bad id/);
    expect(() => scaffold('ok-id', { tier: 'free', root: r })).toThrow(/tier/);
  });
});

describe('module-first boundaries (CI rule)', () => {
  const read = (n: number) => () => Array(n).fill('x').join('\n');
  it('blocks new feature code in apps, allows thin routing/layout glue, tests and assets', () => {
    const files = ['apps/web/lib/new-thing.ts', 'apps/web/components/Widget.tsx', 'apps/web/app/x/page.tsx', 'apps/web/app/api/v1/x/route.ts', 'apps/web/tests/a.test.ts', 'apps/web/public/a.png', 'packages/@platform/x/src/a.ts'];
    const errs = classify(files, new Set(), read(10));
    expect(errs.map((e: string) => e.split(':')[0])).toEqual(['apps/web/lib/new-thing.ts', 'apps/web/components/Widget.tsx']);
  });
  it('fat glue fails; legacy baseline files pass', () => {
    expect(classify(['apps/web/app/x/page.tsx'], new Set(), read(200))).toHaveLength(1);
    expect(classify(['apps/web/lib/old.ts', 'apps/web/app/x/page.tsx'], new Set(['apps/web/lib/old.ts', 'apps/web/app/x/page.tsx']), read(200))).toEqual([]);
  });
});
