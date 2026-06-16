import type { CSSProperties } from 'react';

/** צבעי inbox — עזים וברורים, לפי נושא/סינון */
export const INBOX_TIME_COLORS = {
  all: { main: '#6366f1', soft: 'rgba(99,102,241,0.22)', border: 'rgba(99,102,241,0.55)' },
  open: { main: '#22c55e', soft: 'rgba(34,197,94,0.22)', border: 'rgba(34,197,94,0.55)' },
  today: { main: '#06b6d4', soft: 'rgba(6,182,212,0.22)', border: 'rgba(6,182,212,0.55)' },
  week: { main: '#a855f7', soft: 'rgba(168,85,247,0.22)', border: 'rgba(168,85,247,0.55)' },
  summary: { main: '#eab308', soft: 'rgba(234,179,8,0.22)', border: 'rgba(234,179,8,0.55)' },
} as const;

export type InboxTimeColorKey = keyof typeof INBOX_TIME_COLORS;

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return null;
  const n = Number.parseInt(clean, 16);
  if (!Number.isFinite(n)) return null;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function glassTint(accent: string, alpha = 0.14): string {
  const rgb = hexToRgb(accent);
  if (!rgb) return `rgba(255,255,255,${alpha})`;
  return `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})`;
}

export function glassPanelStyle(accent?: string): CSSProperties {
  const tint = accent ? glassTint(accent, 0.16) : 'rgba(255,255,255,0.1)';
  return {
    background: `linear-gradient(145deg, ${tint} 0%, rgba(255,255,255,0.06) 48%, rgba(255,255,255,0.04) 100%)`,
    border: accent ? `1px solid ${glassTint(accent, 0.42)}` : '1px solid rgba(255,255,255,0.2)',
    boxShadow:
      'inset 0 1px 0 rgba(255,255,255,0.32), inset 0 -1px 0 rgba(0,0,0,0.08), 0 14px 36px rgba(2,6,23,0.28)',
  };
}

export function chipStyle(selected: boolean, main: string, soft: string, border: string): CSSProperties | undefined {
  if (!selected) {
    return {
      border: `1px solid ${glassTint(main, 0.28)}`,
      background: soft,
      color: main,
    };
  }
  return {
    border: `1px solid ${border}`,
    background: `linear-gradient(145deg, ${glassTint(main, 0.38)}, ${glassTint(main, 0.14)})`,
    color: '#ffffff',
    boxShadow: `inset 0 1px 0 rgba(255,255,255,0.22), 0 6px 18px ${glassTint(main, 0.25)}`,
  };
}
