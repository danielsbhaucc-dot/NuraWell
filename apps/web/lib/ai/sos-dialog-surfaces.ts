import type { FrictionCategory } from './almog-commitments/friction';

export const SOS_BODY_BG =
  'linear-gradient(180deg, #ddd6fe 0%, #c7d2fe 38%, #fbcfe8 100%)';

export type SosSurfaceTone = 'lavender' | 'sky' | 'amber' | 'rose' | 'white' | 'slate';

const SURFACE_BASE: Record<SosSurfaceTone, string> = {
  lavender:
    'rounded-2xl border border-violet-400/30 bg-gradient-to-br from-violet-300/35 via-violet-200/25 to-indigo-300/30 shadow-[0_4px_18px_rgba(91,33,182,0.08)]',
  sky:
    'rounded-2xl border border-cyan-400/28 bg-gradient-to-br from-cyan-300/32 via-sky-200/22 to-teal-300/28 shadow-[0_4px_18px_rgba(14,116,144,0.08)]',
  amber:
    'rounded-2xl border border-amber-400/28 bg-gradient-to-br from-amber-300/32 via-orange-200/22 to-amber-200/28 shadow-[0_4px_18px_rgba(180,83,9,0.08)]',
  rose:
    'rounded-2xl border border-rose-400/28 bg-gradient-to-br from-rose-300/30 via-pink-200/22 to-rose-200/26 shadow-[0_4px_18px_rgba(190,18,60,0.07)]',
  white:
    'rounded-2xl border border-violet-300/25 bg-gradient-to-br from-white/75 via-violet-100/40 to-indigo-100/35 shadow-[0_4px_16px_rgba(79,70,229,0.07)]',
  slate:
    'rounded-2xl border border-slate-300/35 bg-gradient-to-br from-slate-200/45 via-stone-200/30 to-slate-100/40 shadow-[0_4px_14px_rgba(51,65,85,0.06)]',
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

export const SOS_LABEL = 'text-xs font-bold text-violet-900/75';
export const SOS_TEXT = 'text-sm text-slate-800';
export const SOS_TEXT_STRONG = 'text-sm font-black text-slate-900';
export const SOS_MUTED = 'text-xs font-semibold text-slate-600';

/** בועת הודעה ממנוול אלמוג */
export const SOS_ALMOG_BUBBLE =
  'rounded-2xl border border-emerald-400/25 bg-gradient-to-br from-emerald-600/88 via-teal-600/85 to-emerald-700/90 px-4 py-3 text-sm font-semibold leading-7 text-emerald-50 shadow-[0_8px_24px_rgba(4,120,87,0.2)]';
