import type { FrictionCategory } from './almog-commitments/friction';

/** רקע ניטרלי-ירקרק — הצבעוניות בתיבות בלבד */
export const SOS_BODY_BG =
  'linear-gradient(180deg, #faf8f5 0%, #f0fdf9 50%, #ecfdf5 100%)';

export type SosSurfaceTone = 'lavender' | 'sky' | 'amber' | 'rose' | 'white' | 'slate';

const SURFACE_BASE: Record<SosSurfaceTone, string> = {
  lavender:
    'rounded-2xl border border-violet-300/55 bg-gradient-to-br from-violet-100 via-violet-50 to-indigo-100/90',
  sky: 'rounded-2xl border border-sky-300/55 bg-gradient-to-br from-sky-100 via-cyan-50 to-sky-50/90',
  amber:
    'rounded-2xl border border-amber-300/55 bg-gradient-to-br from-amber-100 via-orange-50 to-amber-50/85',
  rose: 'rounded-2xl border border-rose-300/55 bg-gradient-to-br from-rose-100 via-pink-50 to-rose-50/90',
  white: 'rounded-2xl border border-emerald-200/45 bg-white/95 shadow-sm',
  slate:
    'rounded-2xl border border-slate-300/55 bg-gradient-to-br from-slate-100 to-stone-100/90',
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

/** בועת הודעה ממנוול אלמוג — ניגודיות גבוהה על רקע בהיר */
export const SOS_ALMOG_BUBBLE =
  'rounded-2xl border border-violet-300/55 bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-700 px-4 py-3.5 text-sm font-semibold leading-7 text-white shadow-[0_10px_28px_rgba(91,33,182,0.28)]';

/** תיבת משימה/הרגל בשער — לא בהיר מדי */
export const SOS_TASK_CARD =
  'rounded-2xl border border-emerald-500/35 bg-gradient-to-br from-emerald-200/95 via-teal-100/90 to-emerald-100/85 px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.5)]';

/** כרטיס משימה ב-intake */
export const SOS_INTAKE_TASK_ACTIVE =
  'rounded-2xl border-2 border-sky-400/55 bg-gradient-to-br from-sky-100 to-cyan-50 ring-2 ring-sky-300/35';

export const SOS_INTAKE_TASK_IDLE =
  'rounded-2xl border border-slate-200/70 bg-gradient-to-br from-slate-50 to-stone-100/90';
