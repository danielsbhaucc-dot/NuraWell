import { describe, expect, it } from 'vitest';
import { resolve, violations } from '../../../scripts/modules/imports.mjs';

const areas = [
  { dir: 'modules/core', json: { id: 'core', core: true, owns: ['apps/web/lib/core/'] } },
  { dir: 'modules/a', json: { id: 'a', core: false, owns: ['apps/web/lib/a/'], api: ['apps/web/lib/a/index.ts'] } },
  { dir: 'modules/b', json: { id: 'b', core: false, owns: ['apps/web/lib/b/'] } },
];

describe('module import boundaries', () => {
  it('resolves @/ and relative specifiers', () => {
    const files = new Map([['apps/web/lib/a/x.ts', ''], ['apps/web/lib/a/index.ts', '']]);
    expect(resolve('apps/web/lib/b/y.ts', '@/lib/a/x', files)).toBe('apps/web/lib/a/x.ts');
    expect(resolve('apps/web/lib/b/y.ts', '../a', files)).toBe('apps/web/lib/a/index.ts');
    expect(resolve('apps/web/lib/b/y.ts', 'react', files)).toBeNull();
  });
  it('allows core and public API imports, flags internal ones', () => {
    const src = new Map([
      ['apps/web/lib/core/c.ts', ''],
      ['apps/web/lib/a/index.ts', ''],
      ['apps/web/lib/a/internal.ts', ''],
      ['apps/web/lib/b/ok.ts', "import { c } from '@/lib/core/c';\nimport { a } from '@/lib/a';"],
      ['apps/web/lib/b/bad.ts', "import { x } from '@/lib/a/internal';"],
      ['apps/web/lib/a/same.ts', "import { x } from './internal';"],
    ]);
    expect(violations(src, areas)).toEqual(['b -> a | apps/web/lib/b/bad.ts -> apps/web/lib/a/internal.ts']);
  });
});
