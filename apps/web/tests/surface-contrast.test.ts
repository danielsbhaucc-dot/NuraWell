import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/** Owner rule: a card/panel must be clearly separated from the background it sits on (never card = bg). */
const css = fs.readFileSync(path.join(__dirname, '../app/globals.css'), 'utf8');
const theme = css.slice(css.indexOf('@theme'), css.indexOf('\n}', css.indexOf('@theme')));
const darkStart = css.indexOf('--color-surface-sunken: #082a1f');
const darkBlock = css.slice(css.lastIndexOf('{', darkStart), css.indexOf('}', darkStart));
const tok = (block: string, name: string) => {
  const m = block.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})\\b`));
  if (!m) throw new Error(`token ${name} must be a solid #rrggbb (no see-through cards)`);
  return m[1];
};
const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
export const contrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const MIN = 1.15;

const LIGHT: Array<[string, string]> = [
  ['surface', 'canvas'], ['background-card', 'background'], ['background-soft', 'background-card'], ['surface-sunken', 'surface'],
];
const DARK_ON: Array<[string, string]> = [['panel-dark', 'forest-950'], ['panel-dark', 'forest-900'], ['panel-dark-input', 'panel-dark'], ['panel-dark-line', 'panel-dark']];
const DARK_SCHEME: Array<[string, string]> = [['surface', 'background'], ['background-card', 'background'], ['surface-sunken', 'surface'], ['surface-elevated', 'background']];

describe('card vs background separation (contrast >= 1.15)', () => {
  for (const [card, bg] of LIGHT) it(`light ${card} on ${bg}`, () => expect(contrast(tok(theme, card), tok(theme, bg))).toBeGreaterThanOrEqual(MIN));
  for (const [card, bg] of DARK_ON) it(`dark ${card} on ${bg}`, () => expect(contrast(tok(theme, card), tok(theme, bg))).toBeGreaterThanOrEqual(MIN));
  for (const [card, bg] of DARK_SCHEME) it(`dark-scheme ${card} on ${bg}`, () => expect(contrast(tok(darkBlock, card), tok(darkBlock, bg))).toBeGreaterThanOrEqual(MIN));
  it('dark auth/404 cards are solid (no backdrop see-through)', () => {
    const rule = css.match(/\.onboarding-hero-card-photo\s*\{[^}]*\}/)![0];
    expect(rule).toContain('var(--color-panel-dark)');
    expect(rule).not.toMatch(/background:\s*rgba\(|backdrop-filter/);
  });
});
