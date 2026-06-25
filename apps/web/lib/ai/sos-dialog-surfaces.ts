import type { CSSProperties } from 'react';

import type { FrictionCategory } from './almog-commitments/friction';

/** רקע גוף הפופאפ — חם וניטרלי */
export const SOS_BODY_BG =
  'linear-gradient(180deg, #faf9f7 0%, #f4faf8 55%, #f0fdf9 100%)';

export const SOS_CREAM_TEXT = '#faf6ef';

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

/** בועת אלמוג — ירוק מותג בהיר + שמנת */
export const SOS_ALMOG_BUBBLE =
  'rounded-2xl border border-emerald-400/40 bg-gradient-to-br from-emerald-500 via-emerald-500 to-teal-500 px-4 py-3.5 font-display text-[15px] font-bold leading-7 shadow-[0_6px_20px_rgba(16,185,129,0.22)]';

export const SOS_ALMOG_BUBBLE_TEXT: CSSProperties = { color: SOS_CREAM_TEXT };

/** בועת שער הרגל */
export const SOS_GATE_BUBBLE =
  'rounded-2xl border border-emerald-400/45 bg-gradient-to-br from-emerald-500 via-teal-500 to-emerald-600 px-4 py-3.5 font-display text-[15px] font-bold leading-7 shadow-[0_6px_18px_rgba(16,185,129,0.2)]';

/** פאנל שער הרגל */
export const SOS_GATE_PANEL =
  'rounded-2xl border border-emerald-200/90 bg-gradient-to-br from-emerald-100/95 via-teal-50 to-amber-50/50 px-4 py-4 shadow-[0_4px_18px_rgba(6,78,59,0.08)]';

/** תיבת משימה/הרגל בשער — מודגשת יותר */
export const SOS_TASK_CARD =
  'rounded-2xl border border-emerald-500/45 bg-gradient-to-br from-emerald-300/85 via-teal-200/80 to-emerald-200/75 px-3 py-3 shadow-[0_4px_14px_rgba(6,95,70,0.14)]';

export const SOS_TASK_CARD_LABEL = 'text-xs font-bold text-emerald-950/85';
export const SOS_TASK_CARD_TITLE = 'text-base font-black leading-snug text-emerald-950';

export const SOS_INTAKE_TASK_ACTIVE =
  'rounded-2xl border-2 border-emerald-500/55 bg-emerald-50/90 shadow-[0_4px_14px_rgba(16,185,129,0.14)] ring-1 ring-emerald-400/30';

export const SOS_INTAKE_TASK_IDLE =
  'rounded-2xl border border-emerald-200/70 bg-white/95 shadow-[0_1px_6px_rgba(6,78,59,0.05)]';

export const SOS_INTAKE_SECTION =
  'rounded-2xl border border-teal-300/60 bg-gradient-to-br from-teal-100/95 via-emerald-50 to-cyan-50/80 px-3 py-3 shadow-[0_4px_16px_rgba(13,148,136,0.12)]';

export const SOS_NOTE_FIELD =
  'rounded-2xl border border-amber-200/70 bg-[#faf6ef] w-full resize-none px-3 py-2.5 text-sm text-slate-900 shadow-[inset_0_1px_2px_rgba(120,90,40,0.06)] outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200/60';

export const SOS_GATE_NO_BUTTON =
  'rounded-2xl border border-rose-300/80 bg-gradient-to-br from-rose-100 via-pink-100 to-rose-50 px-4 py-3 text-sm font-bold text-rose-900 shadow-[0_4px_14px_rgba(244,63,94,0.12)] transition active:scale-[0.99] hover:from-rose-200/90 hover:to-pink-100';

export type SosQuickTriggerId = 'emotional' | 'motivational' | 'physiological';

export const SOS_TRIGGER_CARD: Record<SosQuickTriggerId, string> = {
  emotional: 'rounded-2xl border border-sky-600/30 shadow-[0_8px_22px_rgba(14,165,233,0.32)]',
  motivational: 'rounded-2xl border border-amber-600/25 shadow-[0_8px_22px_rgba(245,158,11,0.32)]',
  physiological: 'rounded-2xl border border-rose-600/25 shadow-[0_8px_22px_rgba(244,63,94,0.3)]',
};

/** רקע מלא לכפתורי טריגר — inline כדי שלא יידרס */
export const SOS_TRIGGER_BG: Record<SosQuickTriggerId, CSSProperties> = {
  emotional: { background: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 55%, #2563eb 100%)' },
  motivational: { background: 'linear-gradient(135deg, #f59e0b 0%, #f97316 100%)' },
  physiological: { background: 'linear-gradient(135deg, #f43f5e 0%, #e11d48 100%)' },
};

export const SOS_TRIGGER_HELPER = 'text-[11px] font-semibold leading-5 text-white/90';
export const SOS_TRIGGER_LABEL = 'text-sm font-black text-white';
