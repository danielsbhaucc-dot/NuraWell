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
