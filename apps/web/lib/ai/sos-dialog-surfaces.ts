import type { FrictionCategory } from './almog-commitments/friction';

export const SOS_BODY_BG =
  'linear-gradient(180deg, #faf8f5 0%, #f5f3ff 48%, #fff7ed 100%)';

export type SosSurfaceTone = 'lavender' | 'sky' | 'amber' | 'rose' | 'white' | 'slate';

const SURFACE_BASE: Record<SosSurfaceTone, string> = {
  lavender:
    'rounded-2xl border border-violet-200/55 bg-gradient-to-br from-violet-50 to-indigo-50/90',
  sky: 'rounded-2xl border border-sky-200/50 bg-gradient-to-br from-sky-50 to-cyan-50/85',
  amber:
    'rounded-2xl border border-amber-200/50 bg-gradient-to-br from-amber-50 to-orange-50/80',
  rose: 'rounded-2xl border border-rose-200/50 bg-gradient-to-br from-rose-50 to-pink-50/85',
  white: 'rounded-2xl border border-slate-200/60 bg-white/95 shadow-sm',
  slate:
    'rounded-2xl border border-slate-200/50 bg-gradient-to-br from-slate-50 to-stone-50/90',
};

export function sosSurface(tone: SosSurfaceTone, extra = ''): string {
  return `${SURFACE_BASE[tone]} ${extra}`.trim();
}

export const TRIGGER_SURFACE: Record<FrictionCategory, SosSurfaceTone> = {
  emotional: 'lavender',
  motivational: 'amber',
  physiological: 'rose',
  logistical: 'sky',
  cognitive: 'lavender',
  social: 'amber',
  knowledge: 'slate',
};

export const SOS_LABEL = 'text-xs font-bold text-slate-600';
export const SOS_TEXT = 'text-sm text-slate-800';
export const SOS_TEXT_STRONG = 'text-sm font-black text-slate-900';
export const SOS_MUTED = 'text-xs font-semibold text-slate-500';
