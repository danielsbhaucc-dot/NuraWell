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
import { FinderDashboard, MODULES } from '@platform/module-library-ui';
describe('module-library-ui render', () => {
  it('renders products, tier badges, and locks always-on modules', () => {
    const html = renderToStaticMarkup(createElement(FinderDashboard, { initialView: 'list' }));
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('NuraWell');
    expect(html).toContain('למכירה');
    expect((html.match(/role="switch"/g) ?? []).length).toBe(MODULES.length);
    expect((html.match(/disabled=""/g) ?? []).length).toBe(MODULES.filter((m) => m.alwaysOn).length);
  });
});
