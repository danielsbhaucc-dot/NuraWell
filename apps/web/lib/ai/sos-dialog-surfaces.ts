import type { FrictionCategory } from './almog-commitments/friction';

/** רקע גוף הפופאפ — חם וניטרלי */
export const SOS_BODY_BG =
  'linear-gradient(180deg, #faf9f7 0%, #f4faf8 55%, #f0fdf9 100%)';

export type SosSurfaceTone = 'lavender' | 'sky' | 'amber' | 'rose' | 'white' | 'slate';

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

export const SOS_LABEL = 'text-xs font-bold text-emerald-900/80';
export const SOS_TEXT = 'text-sm text-slate-800';
export const SOS_TEXT_STRONG = 'text-sm font-black text-slate-900';
export const SOS_MUTED = 'text-xs font-semibold text-slate-500';

/** בועת אלמוג — ירוק מותג + שמנת */
export const SOS_ALMOG_BUBBLE =
  'rounded-2xl border border-emerald-500/35 bg-gradient-to-br from-emerald-700 via-emerald-600 to-teal-600 px-4 py-3.5 font-display text-[15px] font-bold leading-7 text-[#faf6ef] shadow-[0_8px_24px_rgba(4,120,87,0.28)]';

/** בועת שער הרגל — ירוק עמוק יותר */
export const SOS_GATE_BUBBLE =
  'rounded-2xl border border-emerald-600/40 bg-gradient-to-br from-emerald-800 via-emerald-700 to-teal-700 px-4 py-3.5 font-display text-[15px] font-bold leading-7 text-[#f5f0e8] shadow-[0_8px_22px_rgba(4,78,59,0.32)]';

/** פאנל שער הרגל — לא לבן */
export const SOS_GATE_PANEL =
  'rounded-2xl border border-emerald-200/90 bg-gradient-to-br from-emerald-100/95 via-teal-50 to-amber-50/50 px-4 py-4 shadow-[0_4px_18px_rgba(6,78,59,0.08)]';

/** תיבת משימה/הרגל בשער */
export const SOS_TASK_CARD =
  'rounded-2xl border border-emerald-400/45 bg-gradient-to-br from-emerald-200/90 to-teal-100 px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.45)]';

/** כרטיס משימה ב-intake */
export const SOS_INTAKE_TASK_ACTIVE =
  'rounded-2xl border-2 border-emerald-500/55 bg-emerald-50/90 shadow-[0_4px_14px_rgba(16,185,129,0.14)] ring-1 ring-emerald-400/30';

export const SOS_INTAKE_TASK_IDLE =
  'rounded-2xl border border-emerald-200/70 bg-white/95 shadow-[0_1px_6px_rgba(6,78,59,0.05)]';

/** אזור משימות פתוחות — צבעוני */
export const SOS_INTAKE_SECTION =
  'rounded-2xl border border-teal-300/60 bg-gradient-to-br from-teal-100/95 via-emerald-50 to-cyan-50/80 px-3 py-3 shadow-[0_4px_16px_rgba(13,148,136,0.12)]';

export const SOS_NOTE_FIELD =
  'rounded-2xl border border-amber-200/70 bg-[#faf6ef] w-full resize-none px-3 py-2.5 text-sm text-slate-900 shadow-[inset_0_1px_2px_rgba(120,90,40,0.06)] outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200/60';

export type SosQuickTriggerId = 'emotional' | 'motivational' | 'physiological';

/** כפתורי טריגר — צבע מלא וברור */
export const SOS_TRIGGER_CARD: Record<SosQuickTriggerId, string> = {
  emotional:
    'rounded-2xl border border-blue-600/25 bg-gradient-to-l from-blue-600 via-indigo-600 to-violet-600 shadow-[0_8px_22px_rgba(37,99,235,0.35)]',
  motivational:
    'rounded-2xl border border-amber-600/25 bg-gradient-to-l from-amber-500 to-orange-500 shadow-[0_8px_22px_rgba(245,158,11,0.32)]',
  physiological:
    'rounded-2xl border border-rose-600/25 bg-gradient-to-l from-rose-500 to-rose-600 shadow-[0_8px_22px_rgba(244,63,94,0.3)]',
};

export const SOS_TRIGGER_HELPER = 'text-[11px] font-semibold leading-5 text-white/85';
export const SOS_TRIGGER_LABEL = 'text-sm font-black text-white';
