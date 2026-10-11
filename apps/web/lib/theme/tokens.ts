/**
 * Design tokens for places Tailwind classes can't reach (inline gradients, SVG stops, computed styles).
 * Values mirror tailwind.config.ts `theme.extend.colors` — change both together.
 */
export const palette = {
  primary: { 50: '#ecfdf5', 100: '#d1fae5', 200: '#a7f3d0', 300: '#6ee7b7', 400: '#34d399', 500: '#10b981', 600: '#059669', 700: '#047857', 800: '#065f46', 900: '#064e3b', 950: '#022c22' },
  accent: { 100: '#fef3c7', 200: '#fde68a', 400: '#fbbf24', 950: '#451a03' },
  warmLight: '#fef9c3',
  danger950: '#7f1d1d',
  neutral: { 300: '#d1d5db', 400: '#9ca3af' },
  ink: '#1A1730',
  backgroundCard: '#f8fbf6',
  mint: '#EDF5F0',
} as const;
