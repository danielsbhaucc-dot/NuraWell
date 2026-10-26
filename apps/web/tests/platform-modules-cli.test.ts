import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// @ts-expect-error plain .mjs, no types
import { findModules, validateModule, dependencyOrder, renderIndex } from '../../../scripts/modules/lib.mjs';

type M = { dir: string; file: string; json: Record<string, unknown> };

function fakeRepo(mods: Record<string, Record<string, unknown>>, extra: Record<string, string> = {}) {
  const root = mkdtempSync(join(tmpdir(), 'mods-'));
  for (const [name, json] of Object.entries(mods)) {
    const d = join(root, 'packages/@platform', name);
    mkdirSync(join(d, 'src'), { recursive: true });
    writeFileSync(join(d, 'module.json'), JSON.stringify(json));
    writeFileSync(join(d, 'package.json'), JSON.stringify({ name: json.package, version: json.version }));
    for (const f of ['README.he.md', 'llms.txt']) writeFileSync(join(d, f), 'x');
    writeFileSync(join(d, 'CHANGELOG.md'), `## ${json.version}`);
    writeFileSync(join(d, 'src/index.ts'), extra[name] ?? 'export const a = 1;');
  }
  return root;
}
const base = (id: string, o: Record<string, unknown> = {}) => ({
  id, package: `@platform/${id}`, version: '1.0.0', distribution: 'shareable', category: 'feature', toggleable: true,
  description: 'a module used only in tests here', requires: { modules: {} }, env: [], migrations: [], conformance: [], ...o,
});

describe('module system (scripts/modules)', () => {
  it('real repo: every module passes check', () => {
    const mods = findModules() as M[];
    expect(mods.length).toBeGreaterThan(0);
    for (const m of mods) expect(validateModule(m, mods)).toEqual([]);
  });
  it('security modules must be always-on', () => {
    const r = fakeRepo({ s: base('s', { category: 'security', toggleable: true }) });
    const mods = findModules(r) as M[];
    expect(validateModule(mods[0], mods, r).join()).toMatch(/always on/);
  });
  it('shareable modules may not import app code or read env', () => {
    const r = fakeRepo({ a: base('a') }, { a: "import x from '@/lib/x'; const k = process.env.K;" });
    const mods = findModules(r) as M[];
    const e = validateModule(mods[0], mods, r).join('\n');
    expect(e).toMatch(/imports app code/);
    expect(e).toMatch(/process\.env/);
  });
  it('env must be NAMES only; unknown deps and cycles are rejected', () => {
    const r = fakeRepo({ a: base('a', { env: ['sk_live_abc'], requires: { modules: { b: '^1' } } }), b: base('b', { requires: { modules: { a: '^1' } } }) });
    const mods = findModules(r) as M[];
    expect(validateModule(mods[0], mods, r).join()).toMatch(/NAME only/);
    expect(() => dependencyOrder(mods)).toThrow(/cycle/);
  });
  it('dependency order puts requirements first', () => {
    const r = fakeRepo({ a: base('a', { requires: { modules: { b: '^1' } } }), b: base('b') });
    expect((dependencyOrder(findModules(r)) as M[]).map((m) => m.json.id)).toEqual(['b', 'a']);
    expect(renderIndex(findModules(r))).toContain('`a`');
  });
});
