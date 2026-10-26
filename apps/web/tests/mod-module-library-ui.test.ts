import { describe, it, expect } from 'vitest';
import { resolveConfig, defaultConfig } from '../../../packages/@platform/module-library-ui/src/config';

describe('module-library-ui conformance', () => {
  it('config-secure-defaults', () => {
    expect(defaultConfig.enabled).toBe(false);
    expect(defaultConfig.allowedRoles).toEqual(['admin']);
    expect(resolveConfig({ logPii: true as never }).logPii).toBe(false);
  });
  it.todo('disabled-means-404: routes/APIs return 404 and jobs do not run when disabled');
});

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FinderDashboard } from '../../../packages/@platform/module-library-ui/src/FinderDashboard';
import { REGISTRY_LITE, toProductRows } from '../../../packages/@platform/module-library-ui/src/server/hub-data';
const products = toProductRows([{ id: 'nurawell', name: 'NuraWell' }, { id: 'sample', name: 'מוצר לדוגמה' }]);
const base = { registry: REGISTRY_LITE, products, summaries: [], deployment: { securityOpen: null, tasksOpen: null }, metricsError: null, signingReady: false };
describe('module-library-ui render (real registry)', () => {
  it('library list: one switch per module, always-on locked', () => {
    const html = renderToStaticMarkup(createElement(FinderDashboard, { ...base, initialSection: 'product:nurawell' as const, initialView: 'list' }));
    expect(html).toContain('dir="rtl"');
    expect((html.match(/role="switch"/g) ?? []).length).toBe(REGISTRY_LITE.length);
    expect(html).not.toMatch(/background:\s*#fff\b/i);
  });
  it('overview never invents numbers: no data → Hebrew empty states', () => {
    const html = renderToStaticMarkup(createElement(FinderDashboard, { ...base, initialSection: 'overview' as const }));
    expect(html).toContain('אין נתון');
    expect(html).toContain('עוד אין נתונים למוצר הזה');
    expect(html).toContain('עוד לא נבנה');
  });
});

describe('store pages are Hebrew-only', () => {
  it('hebrewProblem flags English and accepts Hebrew with code spans', async () => {
    const { hebrewProblem } = await import('../../../scripts/modules/lib.mjs');
    expect(hebrewProblem('Module licensing. Offline signed licenses.')).toBe('no Hebrew text');
    expect(hebrewProblem('הצפנה חזקה (`AES-256-GCM`) בתוך `field-envelope.ts`')).toBeNull();
    expect(hebrewProblem('רישיון with lots of English words here')).toMatch(/too much English/);
  });
  it('every module ships a Hebrew description', () => {
    for (const m of REGISTRY_LITE) expect(m.store.descriptionHe).toMatch(/[\u0590-\u05FF]/);
  });
});

describe('plain-language UI (no jargon outside "פרטים טכניים")', () => {
  const JARGON = /ed25519|manifest|מניפסט|hmac|tarball|\.tgz|sha-?256|LICENSE_[A-Z_]+|[A-Z]{3,}_[A-Z_]+|base64|\bjwt\b/i;
  const visible = (html: string) => html.replace(/<details class="fd-tech">[\s\S]*?<\/details>/g, '').replace(/<[^>]+>/g, ' ');
  it('hub, dialogs, licenses and store pages', async () => {
    const { ShareDialog, SellDialog } = await import('../../../packages/@platform/module-library-ui/src/Dialogs');
    const { LicensesView } = await import('../../../packages/@platform/module-library-ui/src/LicensesView');
    const { ModuleStorePage } = await import('../../../packages/@platform/module-library-ui/src/ModuleStorePage');
    const { REGISTRY } = await import('../../../packages/@platform/module-library-ui/src/server/hub-data');
    const lic = REGISTRY.find((m) => m.id === 'licensing')!;
    const rows = [{ lid: 'L-1', moduleId: 'licensing', licensee: 'shop-example-com', mode: 'bundle' as const, domains: ['shop.example.com'], issuedAt: '2026-10-01T00:00:00Z', expiresAt: '2026-11-01T00:00:00Z', state: 'active' as const, until: null }];
    const out = { fileName: 'x.tgz', sha256: 'ab', files: ['a.js'], lid: 'L-1', expiresAt: '2026-11-01T00:00:00Z' };
    const html = [
      createElement(ShareDialog, { m: lic, api: '/x', onClose: () => {} }),
      createElement(ShareDialog, { m: lic, api: '/x', onClose: () => {}, initial: { s: 'done', out } }),
      createElement(SellDialog, { m: lic, api: '/x', signingReady: false, onClose: () => {} }),
      createElement(SellDialog, { m: lic, api: '/x', signingReady: true, onClose: () => {}, initial: { s: 'done', out } }),
      createElement(LicensesView, { api: '/x', initial: { s: 'ok', rows, signingReady: true }, initialRevoke: 'L-1' }),
      ...REGISTRY.map((m) => createElement(ModuleStorePage, { m, products: [] })),
    ].map((e) => visible(renderToStaticMarkup(e)));
    for (const h of html) expect(h.match(JARGON)?.[0] ?? null).toBeNull();
  });
  it('sell form has the three plain fields with a 30-day default', async () => {
    const { SellDialog } = await import('../../../packages/@platform/module-library-ui/src/Dialogs');
    const { REGISTRY } = await import('../../../packages/@platform/module-library-ui/src/server/hub-data');
    const h = renderToStaticMarkup(createElement(SellDialog, { m: REGISTRY.find((m) => m.id === 'licensing')!, api: '/x', signingReady: true, onClose: () => {} }));
    expect(h).toContain('שם הקונה'); expect(h).toContain('כתובת האתר של הקונה'); expect(h).toMatch(/<option value="30" selected="">/);
    expect(h.match(/type="submit"/g)).toHaveLength(1);
  });
});
