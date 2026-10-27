import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Owner rule (2026-10-27): no "AI sparkle" iconography in the user app.
 * The only allowed one is the Almog centre button in BottomNav.
 * Coming-soon (frozen) and admin/ops surfaces are out of scope.
 */
const ROOT = join(__dirname, '..');
const DIRS = ['app', 'components', 'lib'];
const SKIP = /(^|\/)(admin|ops|ops-logs|media-manager|coming-soon|node_modules)(\/|$)|\.test\.|\.spec\./;
const ALLOW: Record<string, number> = { 'components/shared/BottomNav.tsx': 2 };
const ICON = /\b(Sparkles?|WandSparkles|Wand2?|Stars|Gem|Diamond)\b(?=[\s,}/>])/g;
const GLYPH = /[✦✧✨💎💫🌟◆❖✶✷✸✹✺✴⭑⭒]/gu;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const rel = relative(ROOT, p);
    if (SKIP.test(rel)) continue;
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|css|json|mjs)$/.test(name)) out.push(p);
  }
  return out;
}

describe('no AI sparkle icons in the user app', () => {
  it('only the Almog centre button keeps a sparkle', () => {
    const offenders: string[] = [];
    for (const d of DIRS) {
      for (const f of walk(join(ROOT, d))) {
        const rel = relative(ROOT, f);
        const src = readFileSync(f, 'utf8');
        const n = (src.match(ICON)?.length ?? 0) + (src.match(GLYPH)?.length ?? 0);
        if (n > (ALLOW[rel] ?? 0)) offenders.push(`${rel} (${n})`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
