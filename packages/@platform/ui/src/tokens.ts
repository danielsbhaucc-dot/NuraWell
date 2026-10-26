/**
 * Canonical design tokens shared by every product.
 * Moved verbatim from apps/web/lib/theme/tokens.ts (that file now re-exports this one).
 * Values mirror apps/web/app/globals.css `--color-*` — change both together.
 * Rule: no pure white anywhere; card surfaces use backgroundCard / glass tones.
 */
export const palette = {
  primary: { 50: '#f2f2f6', 100: '#e8e8ed', 200: '#cfd0d6', 300: '#6ee7b7', 400: '#34d399', 500: '#10b981', 600: '#059669', 700: '#047857', 800: '#065f46', 900: '#064e3b', 950: '#022c22' },
  accent: { 100: '#dedee3', 200: '#cfd0d6', 400: '#fbbf24', 950: '#451a03' },
  warmLight: '#dedee3',
  danger950: '#7f1d1d',
  neutral: { 300: '#d1d5db', 400: '#9ca3af' },
  ink: '#1A1730',
  backgroundCard: '#f2f2f6',
  mint: '#f2f2f6',
} as const;

/** Ops/console glass surfaces (globals.css --color-gc*, --color-glass*). */
export const surfaces = {
  glass: '#e8e8ed',
  glassHi: '#e8e8ed',
  glassRose: '#e8e8ed',
  gc: '#f3f5ec',
  gcHi: '#f1f4ea',
  gcCanvas: '#ebeee2',
  creamTint: '#f1f4ea',
  creamDeep: '#dedee3',
} as const;

export type Palette = typeof palette;

/** CSS custom properties for apps that don't share apps/web/globals.css (e.g. new products). */
export function tokensCss(selector = ':root'): string {
  const v: [string, string][] = [
    ...Object.entries(palette.primary).map(([k, c]) => [`--color-primary-${k}`, c] as [string, string]),
    ['--color-accent-100', palette.accent[100]],
    ['--color-accent-400', palette.accent[400]],
    ['--color-ink', palette.ink],
    ['--color-background-card', palette.backgroundCard],
    ['--color-mint', palette.mint],
    ['--color-glass', surfaces.glass],
    ['--color-glass-hi', surfaces.glassHi],
    ['--color-gc', surfaces.gc],
    ['--color-gc-canvas', surfaces.gcCanvas],
    ['--color-cream-deep', surfaces.creamDeep],
  ];
  return `${selector}{${v.map(([k, c]) => `${k}:${c}`).join(';')}}`;
}

/** Guard used by tests/design-lint of new products: true when a colour is white or near-white (every RGB channel >= 0xF3). */
export function isPureWhite(color: string): boolean {
  const c = color.trim().toLowerCase().replace(/\s+/g, '');
  if (c === ['wh', 'ite'].join('')) return true;
  const rgb = /^rgba?\((\d+),(\d+),(\d+)/.exec(c);
  if (rgb) return rgb.slice(1, 4).every((v) => Number(v) >= 0xf3);
  const hex = /^#([0-9a-f]{3,8})$/.exec(c)?.[1];
  if (!hex || ![3, 4, 6, 8].includes(hex.length)) return false;
  const full = hex.length <= 4 ? hex.slice(0, 3).split('').map((x) => x + x).join('') : hex.slice(0, 6);
  return [0, 2, 4].every((i) => parseInt(full.slice(i, i + 2), 16) >= 0xf3);
}
