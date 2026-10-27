import { readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { checkToggle, decideGate, dependentsOf, ownerOfPage, ownerOfPath, validateRegistry, type ModuleState } from '@platform/iam';
import { MODULES } from '@/lib/platform/catalog';

const APP = path.join(__dirname, '../app');
function walk(dir: string, file: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) walk(p, file, out); else if (e === file) out.push(p);
  }
  return out;
}
/** app/(group)/a/[id]/page.tsx → /a/[id] */
const urlOf = (f: string) => {
  const rel = path.relative(APP, path.dirname(f)).split(path.sep).filter((s) => s && !/^\(.*\)$/.test(s) && !s.startsWith('@'));
  return '/' + rel.join('/');
};
const routes = walk(APP, 'route.ts').map((f) => urlOf(f));
const pages = walk(APP, 'page.tsx').map((f) => urlOf(f)).filter((u) => u !== '/__nf');

describe('every surface belongs to a module (WordPress-style registry)', () => {
  it('found the app', () => { expect(routes.length).toBeGreaterThan(200); expect(pages.length).toBeGreaterThan(50); });
  it('every route handler (API, cron, webhook, workflow) has an owning module', () => {
    expect(routes.filter((r) => !ownerOfPath(MODULES, r))).toEqual([]);
  });
  it('every page has an owning module', () => {
    expect(pages.filter((p) => !ownerOfPage(MODULES, p))).toEqual([]);
  });
  it('every scheduled job in vercel.json is owned as a cron (so it is skipped, not 404ed, when off)', () => {
    const v = JSON.parse(readFileSync(path.join(__dirname, '../vercel.json'), 'utf8')) as { crons?: { path: string }[] };
    for (const c of v.crons ?? []) expect([c.path, ownerOfPath(MODULES, c.path)?.surface]).toEqual([c.path, 'cron']);
  });
  it('every /cron/ route is registered as a cron surface', () => {
    const bad = routes.filter((r) => r.includes('/cron/')).filter((r) => ownerOfPath(MODULES, r)?.surface !== 'cron');
    expect(bad).toEqual([]);
  });
  it('registry is consistent and ids unique', () => {
    expect(validateRegistry(MODULES)).toEqual([]);
    expect(new Set(MODULES.map((m) => m.id)).size).toBe(MODULES.length);
  });
  it('the proxy runs the shared gate', () => {
    const src = readFileSync(path.join(__dirname, '../proxy.ts'), 'utf8');
    expect(src).toContain("moduleGate.gateRequest(pathname, kind)");
  });
});

const owner = (p: string) => ownerOfPath(MODULES, p);
const st = (off: string[], source: 'central' | 'cache' | 'failsafe' = 'central') => ({ source, states: MODULES.map((m) => ({ moduleId: m.id, enabled: !off.includes(m.id) })) });

describe('shared module gate', () => {
  it('all enabled → nothing blocked (zero behavior change)', () => {
    for (const r of routes) expect(decideGate(MODULES, owner(r), st([])).blocked).toBe(false);
    for (const p of pages) expect(decideGate(MODULES, ownerOfPage(MODULES, p), st([])).blocked).toBe(false);
  });
  it('module off → its user API, cron and page are blocked', () => {
    expect(decideGate(MODULES, owner('/api/v1/ai/chat'), st(['agent'])).blocked).toBe(true);
    expect(decideGate(MODULES, owner('/api/v1/ai/cron/memory-pipeline'), st(['agent']))).toMatchObject({ blocked: true, surface: 'cron' });
    expect(decideGate(MODULES, ownerOfPage(MODULES, '/ops/ceo/insights'), st(['gideon'])).blocked).toBe(true);
  });
  it('a dependency off blocks the dependent (reminders needs agent)', () => {
    expect(decideGate(MODULES, owner('/api/v1/ai/cron/almog-reminders'), st(['agent']))).toMatchObject({ blocked: true, offModule: 'agent' });
  });
  it('core and essential modules are never blocked for users', () => {
    const all = MODULES.map((m) => m.id);
    for (const p of ['/api/v1/billing/checkout', '/api/webhooks/billing', '/api/v1/account/delete', '/api/v1/ai/cron/master', '/api/v1/auth/post-verify', '/api/v1/legal/anchor', '/api/v1/profile', '/api/v1/stepup/approve'])
      expect([p, decideGate(MODULES, owner(p), st(all)).blocked]).toEqual([p, false]);
  });
  it('central outage without a verified snapshot never blocks users; a cached snapshot still applies', () => {
    expect(decideGate(MODULES, owner('/api/v1/ai/chat'), st(['agent'], 'failsafe')).blocked).toBe(false);
    expect(decideGate(MODULES, owner('/api/v1/ai/chat'), null).blocked).toBe(false);
    expect(decideGate(MODULES, owner('/api/v1/ai/chat'), st(['agent'], 'cache')).blocked).toBe(true);
  });
  it('a module with no central row is not blocked', () => {
    expect(decideGate(MODULES, owner('/api/v1/challenge/state'), { source: 'central', states: [] }).blocked).toBe(false);
  });
  it('admin paths are left to authorize() (stricter, unchanged)', () => {
    expect(decideGate(MODULES, owner('/api/v1/admin/costs'), st(['costs'])).blocked).toBe(false);
  });
});

describe('toggle rules', () => {
  const on = (ids: string[]): ModuleState[] => ids.map((moduleId) => ({ productId: 'p', moduleId, enabled: true }));
  const nonCore = MODULES.filter((m) => !m.core).map((m) => m.id);
  it('cannot disable a module others depend on while they are on', () => {
    expect(dependentsOf(MODULES, 'agent').map((m) => m.id)).toContain('reminders');
    expect(checkToggle(MODULES, on(nonCore), 'p', 'agent', false)).toEqual({ ok: false, reason: 'has_dependents', modules: ['reminders'] });
    expect(checkToggle(MODULES, on(nonCore.filter((x) => x !== 'reminders')), 'p', 'agent', false)).toEqual({ ok: true });
  });
  it('cannot enable with a missing dependency', () => {
    expect(checkToggle(MODULES, on([]), 'p', 'reminders', true)).toEqual({ ok: false, reason: 'missing_dependency', modules: ['agent'] });
  });
  it('core can never be disabled', () => {
    expect(checkToggle(MODULES, on(nonCore), 'p', 'security-core', false)).toMatchObject({ ok: false, reason: 'core_module' });
  });
});
