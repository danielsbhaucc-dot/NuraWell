import type { FrictionCategory } from './almog-commitments/friction';

/** רקע ניטרלי-ירקרק — הצבעוניות בתיבות בלבד */
export const SOS_BODY_BG =
  'linear-gradient(180deg, #faf8f5 0%, #f0fdf9 50%, #ecfdf5 100%)';

export type SosSurfaceTone = 'lavender' | 'sky' | 'amber' | 'rose' | 'white' | 'slate';

const SURFACE_BASE: Record<SosSurfaceTone, string> = {
  lavender:
    'rounded-2xl border border-violet-200/55 bg-gradient-to-br from-violet-50 to-indigo-50/90',
  sky: 'rounded-2xl border border-sky-200/50 bg-gradient-to-br from-sky-50 to-cyan-50/85',
  amber:
    'rounded-2xl border border-amber-200/50 bg-gradient-to-br from-amber-50 to-orange-50/80',
  rose: 'rounded-2xl border border-rose-200/50 bg-gradient-to-br from-rose-50 to-pink-50/85',
  white: 'rounded-2xl border border-emerald-200/45 bg-white/95 shadow-sm',
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

export const SOS_LABEL = 'text-xs font-bold text-emerald-900/70';
export const SOS_TEXT = 'text-sm text-emerald-950';
export const SOS_TEXT_STRONG = 'text-sm font-black text-emerald-950';
export const SOS_MUTED = 'text-xs font-semibold text-emerald-800/60';

/** בועת הודעה ממנוול אלמוג */
export const SOS_ALMOG_BUBBLE =
  'rounded-2xl border border-emerald-400/30 bg-gradient-to-br from-emerald-600/90 via-teal-600/88 to-emerald-700/92 px-4 py-3 text-sm font-semibold leading-7 text-emerald-50 shadow-[0_8px_24px_rgba(4,120,87,0.18)]';
