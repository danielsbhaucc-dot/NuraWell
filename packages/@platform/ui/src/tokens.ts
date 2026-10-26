/**
 * Canonical design tokens shared by every product.
 * Moved verbatim from apps/web/lib/theme/tokens.ts (that file now re-exports this one).
 * Values mirror apps/web/app/globals.css `--color-*` — change both together.
 * Rule: no pure white anywhere; card surfaces use backgroundCard / glass tones.
 */
export const palette = {
  primary: { 50: '#ecfdf5', 100: '#d1fae5', 200: '#a7f3d0', 300: '#6ee7b7', 400: '#34d399', 500: '#10b981', 600: '#059669', 700: '#047857', 800: '#065f46', 900: '#064e3b', 950: '#022c22' },
  accent: { 100: '#fef3c7', 200: '#fde68a', 400: '#fbbf24', 950: '#451a03' },
  warmLight: '#fef9c3',
  danger950: '#7f1d1d',
  neutral: { 300: '#d1d5db', 400: '#9ca3af' },
  ink: '#1A1730',
  backgroundCard: '#F7FBF4',
  mint: '#EDF5F0',
} as const;

/** Ops/console glass surfaces (globals.css --color-gc*, --color-glass*). */
export const surfaces = {
  glass: '#e7eedc',
  glassHi: '#eef3e4',
  glassRose: '#f3e2dc',
  gc: '#f3f5ec',
  gcHi: '#f1f4ea',
  gcCanvas: '#ebeee2',
  creamTint: '#f1f4ea',
  creamDeep: '#e9e4d6',
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

/** Guard used by tests/design-lint of new products: true when a colour is pure white. */
export function isPureWhite(color: string): boolean {
  const c = color.trim().toLowerCase().replace(/\s+/g, '');
  return c === '#fff' || c === '#ffffff' || c === 'white' || c === 'rgb(255,255,255)' || c.startsWith('rgba(255,255,255,');
}
