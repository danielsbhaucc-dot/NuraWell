import type { FrictionCategory } from './almog-commitments/friction';

/** רקע גוף הפופאפ — חם וניטרלי */
export const SOS_BODY_BG =
  'linear-gradient(180deg, #faf9f7 0%, #f4faf8 55%, #f0fdf9 100%)';

export type SosSurfaceTone = 'lavender' | 'sky' | 'amber' | 'rose' | 'white' | 'slate';

/** תיבות משניות (תשובה, אפשרויות) — אטומות, לא שקופות */
const SURFACE_BASE: Record<SosSurfaceTone, string> = {
  lavender:
    'rounded-2xl border border-slate-200/80 bg-white shadow-[0_2px_10px_rgba(15,23,42,0.04)]',
  sky: 'rounded-2xl border border-sky-200/70 bg-sky-50 shadow-[0_2px_10px_rgba(14,116,144,0.06)]',
  amber:
    'rounded-2xl border border-amber-200/70 bg-amber-50 shadow-[0_2px_10px_rgba(180,83,9,0.06)]',
  rose: 'rounded-2xl border border-rose-200/70 bg-rose-50 shadow-[0_2px_10px_rgba(190,18,60,0.05)]',
  white:
    'rounded-2xl border border-emerald-100 bg-white shadow-[0_2px_10px_rgba(6,78,59,0.05)]',
  slate:
    'rounded-2xl border border-slate-200 bg-slate-50 shadow-[0_2px_8px_rgba(15,23,42,0.04)]',
};

export function sosSurface(tone: SosSurfaceTone, extra = ''): string {
  return `${SURFACE_BASE[tone]} ${extra}`.trim();
}

export const TRIGGER_SURFACE: Record<FrictionCategory, SosSurfaceTone> = {
  emotional: 'sky',
  motivational: 'amber',
  physiological: 'rose',
  logistical: 'sky',
  cognitive: 'slate',
  social: 'amber',
  knowledge: 'slate',
};

export const SOS_LABEL = 'text-xs font-bold text-emerald-900/75';
export const SOS_TEXT = 'text-sm text-slate-800';
export const SOS_TEXT_STRONG = 'text-sm font-black text-slate-900';
export const SOS_MUTED = 'text-xs font-semibold text-slate-500';

/** בועת אלמוג — קרם חם + טקסט ירוק כהה, לא סגול */
export const SOS_ALMOG_BUBBLE =
  'rounded-2xl border border-emerald-200/90 bg-[#f8fffb] px-4 py-3.5 text-sm font-semibold leading-7 text-emerald-950 shadow-[0_4px_18px_rgba(6,78,59,0.07)]';

/** תיבת משימה/הרגל בשער */
export const SOS_TASK_CARD =
  'rounded-2xl border border-emerald-300/50 bg-gradient-to-br from-emerald-100 to-teal-50 px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]';

/** כרטיס משימה ב-intake */
export const SOS_INTAKE_TASK_ACTIVE =
  'rounded-2xl border-2 border-emerald-500/50 bg-white shadow-[0_4px_14px_rgba(16,185,129,0.12)] ring-1 ring-emerald-400/25';

export const SOS_INTAKE_TASK_IDLE =
  'rounded-2xl border border-slate-200/90 bg-white shadow-[0_1px_6px_rgba(15,23,42,0.04)]';

export const SOS_INTAKE_SECTION =
  'rounded-2xl border border-emerald-100/90 bg-white px-3 py-3 shadow-[0_2px_12px_rgba(6,78,59,0.05)]';

export const SOS_NOTE_FIELD =
  'rounded-2xl border border-slate-200/90 bg-white w-full resize-none px-3 py-2.5 text-sm text-slate-900 shadow-[inset_0_1px_2px_rgba(15,23,42,0.04)] outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200/60';

/** כפתורי טריגר ראשיים — צבע מלא, לא פסטל שקוף */
export type SosQuickTriggerId = 'emotional' | 'motivational' | 'physiological';

export const SOS_TRIGGER_CARD: Record<SosQuickTriggerId, string> = {
  emotional:
    'rounded-2xl border border-cyan-700/20 bg-gradient-to-l from-cyan-600 to-teal-500 shadow-[0_8px_22px_rgba(8,145,178,0.32)]',
  motivational:
    'rounded-2xl border border-amber-600/20 bg-gradient-to-l from-amber-500 to-orange-500 shadow-[0_8px_22px_rgba(245,158,11,0.3)]',
  physiological:
    'rounded-2xl border border-rose-600/20 bg-gradient-to-l from-rose-500 to-rose-600 shadow-[0_8px_22px_rgba(244,63,94,0.28)]',
};

export const SOS_TRIGGER_HELPER = 'text-[11px] font-semibold leading-5 text-white/80';
export const SOS_TRIGGER_LABEL = 'text-sm font-black text-white';
