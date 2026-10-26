/**
 * Design tokens for places Tailwind classes can't reach (inline gradients, SVG stops, computed styles).
 * Values mirror tailwind.config.ts `theme.extend.colors` — change both together.
 */
export const palette = {
  primary: { 50: '#f2f2f6', 100: '#e8e8ed', 200: '#cfd0d6', 300: '#6ee7b7', 400: '#34d399', 500: '#10b981', 600: '#059669', 700: '#047857', 800: '#065f46', 900: '#064e3b', 950: '#022c22' },
  accent: { 100: '#f2f2f6', 200: '#cfd0d6', 400: '#fbbf24', 950: '#451a03' },
  warmLight: '#f2f2f6',
  danger950: '#7f1d1d',
  neutral: { 300: '#d1d5db', 400: '#9ca3af' },
  ink: '#1A1730',
  backgroundCard: '#f2f2f6',
  mint: '#f2f2f6',
} as const;
