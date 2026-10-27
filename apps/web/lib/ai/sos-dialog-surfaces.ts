import type { CSSProperties } from 'react';

import type { FrictionCategory } from '@/lib/module-api/reminders/lib-ai-almog-commitments-friction';

/** רקע גוף הפופאפ — חם וניטרלי */
export const SOS_BODY_BG =
  'linear-gradient(180deg, #f2f2f6 0%, #f2f2f6 55%, #f2f2f6 100%)';

export const SOS_CREAM_TEXT = '#faf6ef';

export type SosSurfaceTone = 'lavender' | 'sky' | 'amber' | 'rose' | 'glass' | 'slate';

const SURFACE_BASE: Record<SosSurfaceTone, string> = {
  lavender:
    'rounded-2xl border border-ink-200/80 bg-background-card shadow-[0_2px_10px_rgba(15,23,42,0.04)]',
  sky: 'rounded-2xl border border-secondary-200/70 bg-secondary-50 shadow-[0_2px_10px_rgba(14,116,144,0.06)]',
  amber:
    'rounded-2xl border border-accent-200/70 bg-accent-50 shadow-[0_2px_10px_rgba(180,83,9,0.06)]',
  rose: 'rounded-2xl border border-coral-200/70 bg-coral-50 shadow-[0_2px_10px_rgba(190,18,60,0.05)]',
  glass:
    'rounded-2xl border border-primary-100 bg-background-card shadow-[0_2px_10px_rgba(6,78,59,0.05)]',
  slate:
    'rounded-2xl border border-ink-200 bg-ink-50 shadow-[0_2px_8px_rgba(15,23,42,0.04)]',
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

export const SOS_LABEL = 'text-xs font-bold text-primary-900/80';
export const SOS_TEXT = 'text-sm text-ink-800';
export const SOS_TEXT_STRONG = 'text-sm font-black text-ink-900';
export const SOS_MUTED = 'text-xs font-semibold text-ink-500';

/** בועת אלמוג — ירוק מותג בהיר + שמנת */
export const SOS_ALMOG_BUBBLE =
  'rounded-2xl border border-primary-400/40 bg-gradient-to-br from-primary-500 via-primary-500 to-secondary-500 px-4 py-3.5 font-display text-[15px] font-bold leading-7 shadow-[0_6px_20px_rgba(16,185,129,0.22)]';

export const SOS_ALMOG_BUBBLE_TEXT: CSSProperties = { color: SOS_CREAM_TEXT };

/** בועת שער הרגל */
export const SOS_GATE_BUBBLE =
  'rounded-2xl border border-primary-400/45 bg-gradient-to-br from-primary-500 via-secondary-500 to-primary-600 px-4 py-3.5 font-display text-[15px] font-bold leading-7 shadow-[0_6px_18px_rgba(16,185,129,0.2)]';

/** פאנל שער הרגל */
export const SOS_GATE_PANEL =
  'rounded-2xl border border-primary-200/90 bg-gradient-to-br from-primary-100/95 via-secondary-50 to-accent-50/50 px-4 py-4 shadow-[0_4px_18px_rgba(6,78,59,0.08)]';

/** תיבת משימה/הרגל בשער — מודגשת יותר */
export const SOS_TASK_CARD =
  'rounded-2xl border border-primary-500/45 bg-gradient-to-br from-primary-300/85 via-secondary-200/80 to-primary-200/75 px-3 py-3 shadow-[0_4px_14px_rgba(6,95,70,0.14)]';

export const SOS_TASK_CARD_LABEL = 'text-xs font-bold text-primary-950/85';
export const SOS_TASK_CARD_TITLE = 'text-base font-black leading-snug text-primary-950';

export const SOS_INTAKE_TASK_ACTIVE =
  'rounded-2xl border-2 border-primary-500/55 bg-primary-50/90 shadow-[0_4px_14px_rgba(16,185,129,0.14)] ring-1 ring-primary-400/30';

export const SOS_INTAKE_TASK_IDLE =
  'rounded-2xl border border-primary-200/70 bg-background-card/95 shadow-[0_1px_6px_rgba(6,78,59,0.05)]';

export const SOS_INTAKE_SECTION =
  'rounded-2xl border border-secondary-300/60 bg-gradient-to-br from-secondary-100/95 via-primary-50 to-secondary-50/80 px-3 py-3 shadow-[0_4px_16px_rgba(13,148,136,0.12)]';

export const SOS_NOTE_FIELD =
  'rounded-2xl border border-accent-200/70 bg-[#faf6ef] w-full resize-none px-3 py-2.5 text-sm text-ink-900 shadow-[inset_0_1px_2px_rgba(120,90,40,0.06)] outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-200/60';

export const SOS_GATE_NO_BUTTON =
  'rounded-2xl border border-coral-300/80 bg-gradient-to-br from-coral-100 via-coral-100 to-coral-50 px-4 py-3 text-sm font-bold text-coral-900 shadow-[0_4px_14px_rgba(244,63,94,0.12)] transition active:scale-[0.99] hover:from-coral-200/90 hover:to-coral-100';

export type SosQuickTriggerId = 'emotional' | 'motivational' | 'physiological';

export const SOS_TRIGGER_CARD: Record<SosQuickTriggerId, string> = {
  emotional: 'rounded-2xl border border-secondary-600/30 shadow-[0_8px_22px_rgba(14,165,233,0.32)]',
  motivational: 'rounded-2xl border border-accent-600/25 shadow-[0_8px_22px_rgba(245,158,11,0.32)]',
  physiological: 'rounded-2xl border border-coral-600/25 shadow-[0_8px_22px_rgba(244,63,94,0.3)]',
};

/** רקע מלא לכפתורי טריגר — inline כדי שלא יידרס */
export const SOS_TRIGGER_BG: Record<SosQuickTriggerId, CSSProperties> = {
  emotional: { background: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 55%, #2563eb 100%)' },
  motivational: { background: 'linear-gradient(135deg, #f59e0b 0%, #f97316 100%)' },
  physiological: { background: 'linear-gradient(135deg, #f43f5e 0%, #e11d48 100%)' },
};

export const SOS_TRIGGER_HELPER = 'text-[11px] font-semibold leading-5 text-on-dark/90';
export const SOS_TRIGGER_LABEL = 'text-sm font-black text-on-dark';
