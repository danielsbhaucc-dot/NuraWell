import type { CSSProperties } from 'react';

export const glassOverlayClass =
  'fixed inset-0 z-[280] bg-emerald-950/38 backdrop-blur-[6px]';

export const glassPanelStyle: CSSProperties = {
  border: '1px solid rgba(255,255,255,0.48)',
  boxShadow:
    '0 -24px 64px rgba(6,78,59,0.18), 0 0 0 1px rgba(255,255,255,0.32) inset, inset 0 1px 0 rgba(255,255,255,0.55)',
  background:
    'linear-gradient(168deg, rgba(255,255,255,0.52) 0%, rgba(236,253,245,0.38) 42%, rgba(255,255,255,0.46) 100%)',
  backdropFilter: 'blur(28px) saturate(1.35)',
  WebkitBackdropFilter: 'blur(28px) saturate(1.35)',
};

export const glassCardStyle: CSSProperties = {
  background: 'rgba(255,255,255,0.22)',
  border: '1px solid rgba(255,255,255,0.45)',
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
};

export const glassInputClass =
  'w-full rounded-xl border border-white/50 bg-white/25 px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-500 focus:ring-2 focus:ring-emerald-400/45 backdrop-blur-sm';

export const progressBarStyle: CSSProperties = {
  background: 'linear-gradient(90deg, #059669, #10b981, #34d399, #2dd4bf)',
};
