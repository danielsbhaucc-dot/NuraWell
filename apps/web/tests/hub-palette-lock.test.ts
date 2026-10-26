// Visual-regression guard for the ops dashboard / module hub: its colours may not change silently.
// If a change is intentional, regenerate with UPDATE_HUB_PALETTE=1 npx vitest run tests/hub-palette-lock.test.ts
// and attach before/after hub screenshots to the PR.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.join(__dirname, '../../..');
const SNAP = path.join(__dirname, 'hub-palette.lock.json');
const COLOR = /#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|oklch\([^)]*\)/gi;

function current() {
  const finder = fs.readFileSync(path.join(ROOT, 'packages/@platform/module-library-ui/src/finder.css'), 'utf8');
  const globals = fs.readFileSync(path.join(__dirname, '../app/globals.css'), 'utf8');
  const theme = globals.slice(globals.indexOf('@theme'), globals.indexOf('/* Coming-soon is frozen:'));
  const opsTokens: Record<string, string> = {};
  for (const m of theme.matchAll(/--color-(gc[\w-]*|glass[\w-]*|canvas|surface|hairline):\s*([^;]+);/g)) opsTokens[m[1]] ??= m[2].trim(); // first (light) definition
  const finderColors = [...new Set((finder.match(COLOR) || []).map((c) => c.toLowerCase().replace(/\s+/g, '')))].sort();
  return { opsTokens, finderColors };
}

describe('ops dashboard / module hub palette lock', () => {
  it('matches the approved snapshot', () => {
    const cur = current();
    if (process.env.UPDATE_HUB_PALETTE) fs.writeFileSync(SNAP, JSON.stringify(cur, null, 2) + '\n');
    expect(cur).toEqual(JSON.parse(fs.readFileSync(SNAP, 'utf8')));
  });
});
