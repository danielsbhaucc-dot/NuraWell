/**
 * Page-pass guard: every internal href / router.push target in app + components must resolve to a real
 * route (app router page or route handler). Catches broken links after page merges/renames.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const root = join(__dirname, '..');
const walk = (d: string): string[] =>
  readdirSync(d).flatMap((f) => {
    const p = join(d, f);
    if (f === 'node_modules' || f.startsWith('.')) return [];
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

function routePatterns(): RegExp[] {
  return walk(join(root, 'app'))
    .filter((f) => /[\\/](page|route)\.(t|j)sx?$/.test(f))
    .map((f) => {
      const segs = relative(join(root, 'app'), f).split(sep).slice(0, -1).filter((s) => !/^\(.*\)$/.test(s) && !s.startsWith('@'));
      const re = segs
        .map((s) => (s.startsWith('[[...') ? '(?:/.*)?' : s.startsWith('[...') ? '/.+' : s.startsWith('[') ? '/[^/]+' : `/${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`))
        .join('');
      return new RegExp(`^${re || '/'}/?$`);
    });
}

describe('internal links resolve to routes', () => {
  it('no broken internal hrefs', () => {
    const patterns = routePatterns();
    const files = [...walk(join(root, 'app')), ...walk(join(root, 'components'))].filter((f) => /\.(t|j)sx?$/.test(f));
    const broken: string[] = [];
    const re = /(?:href=|href:\s*|push\(|replace\(|redirect\()\s*['"`](\/[^'"`?#$]*)['"`]/g;
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(re)) {
        const path = m[1].replace(/\/$/, '') || '/';
        if (path.startsWith('/api/') || path.startsWith('/_next') || /\.(png|jpe?g|svg|webp|ico|pdf|mp3|mp4|json|txt|xml)$/.test(path)) continue;
        if (!patterns.some((p) => p.test(path)) && !patterns.some((p) => p.test(`/ops${path}`))) broken.push(`${relative(root, f)} → ${path}`);
      }
    }
    expect(broken).toEqual([]);
  });
});
