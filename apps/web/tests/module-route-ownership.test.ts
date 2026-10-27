import { readdirSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { moduleForPath } from '@platform/iam';
import { MODULES } from '@/lib/platform/catalog';

/**
 * Every admin/ops API area must be owned by a module, so a module toggle is enforced server-side
 * (requireApiAdmin → authorize → moduleForPath). Areas not yet assigned are listed explicitly;
 * shrinking this list is the modularity backlog (see modular-audit). A NEW unowned area fails CI.
 */
const NOT_YET_OWNED = new Set<string>([]);

const areas = ['admin', 'ops'].flatMap((g) =>
  readdirSync(path.join(__dirname, '../app/api/v1', g), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => `/api/v1/${g}/${d.name}`),
);

describe('module route ownership', () => {
  it('every admin/ops API area is owned by a module or explicitly listed as not yet owned', () => {
    const unowned = areas.filter((a) => !moduleForPath(MODULES, a) && !NOT_YET_OWNED.has(a));
    expect(unowned).toEqual([]);
  });
  it('the not-yet-owned list has no stale entries', () => {
    const stale = [...NOT_YET_OWNED].filter((a) => !areas.includes(a) || moduleForPath(MODULES, a));
    expect(stale).toEqual([]);
  });
});
