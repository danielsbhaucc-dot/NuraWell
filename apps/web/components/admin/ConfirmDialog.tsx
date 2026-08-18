'use client';

import { AlertTriangle, CheckCircle2, Info, Loader2, X } from 'lucide-react';
import { AnimatedDialog } from '../shared/AnimatedDialog';

export type ConfirmDialogTone = 'danger' | 'success' | 'warning' | 'info';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** מראה "מסוכן" (מחיקה) — כפתור אישור אדום. */
  danger?: boolean;
  tone?: ConfirmDialogTone;
  busy?: boolean;
  /** מצב התראה — כפתור אחד בלבד (מחליף window.alert). */
  alert?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const TONE_STYLES: Record<
  ConfirmDialogTone,
  { iconWrap: string; btn: string; Icon: typeof AlertTriangle }
> = {
  danger: {
    iconWrap: 'border-red-300/60 bg-red-100/70 text-red-600',
    btn: 'bg-gradient-to-l from-red-600 to-rose-500 shadow-red-500/25',
    Icon: AlertTriangle,
  },
  warning: {
    iconWrap: 'border-amber-300/60 bg-amber-100/70 text-amber-700',
    btn: 'bg-gradient-to-l from-amber-600 to-orange-500 shadow-amber-500/25',
    Icon: AlertTriangle,
  },
  success: {
    iconWrap: 'border-emerald-300/60 bg-emerald-100/70 text-emerald-700',
    btn: 'bg-gradient-to-l from-emerald-600 to-teal-500 shadow-emerald-500/25',
    Icon: CheckCircle2,
  },
  info: {
    iconWrap: 'border-indigo-300/60 bg-indigo-100/70 text-indigo-700',
    btn: 'bg-gradient-to-l from-indigo-600 to-violet-500 shadow-indigo-500/25',
    Icon: Info,
  },
};

/** פופאפ אישור/התראה בעיצוב זכוכית שקוף — מחליף את confirm()/alert המובנה. */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel = 'ביטול',
  danger = false,
  tone,
  busy = false,
  alert = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const resolvedTone: ConfirmDialogTone = tone ?? (danger ? 'danger' : 'success');
  const style = TONE_STYLES[resolvedTone];
  const Icon = style.Icon;
  const resolvedConfirmLabel = confirmLabel ?? (alert ? 'הבנתי' : 'אישור');

  return (
    <AnimatedDialog
      open={open}
      onClose={() => !busy && onCancel()}
      zIndex={320}
      aria-label={title}
      backdropClassName="absolute inset-0 cursor-default bg-slate-900/30 backdrop-blur-sm"
      panelClassName="max-w-sm overflow-hidden rounded-3xl border border-white/40 bg-white/20 p-5 shadow-[0_20px_60px_-12px_rgba(15,23,42,0.5)] ring-1 ring-inset ring-white/30 backdrop-blur-2xl backdrop-saturate-150"
    >
      <div className="pointer-events-none absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent" />

      <button
        type="button"
        onClick={() => !busy && onCancel()}
        aria-label="סגור"
        className="absolute left-3 top-3 inline-flex h-7 w-7 items-center justify-center rounded-lg border border-white/50 bg-white/40 text-slate-600 hover:bg-white/70"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="flex items-start gap-3">
        <span
          className={[
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border',
            style.iconWrap,
          ].join(' ')}
        >
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1 pt-0.5">
          <h3 className="text-base font-black text-slate-800">{title}</h3>
          {message && <p className="mt-1 text-sm leading-snug text-slate-600">{message}</p>}
        </div>
      </div>

      <div className="mt-5 flex gap-2">
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className={[
            'inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-black text-white shadow-lg disabled:opacity-60',
            style.btn,
          ].join(' ')}
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {resolvedConfirmLabel}
        </button>
        {!alert ? (
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="inline-flex items-center justify-center rounded-xl border border-white/60 bg-white/40 px-4 py-2.5 text-sm font-bold text-slate-700 backdrop-blur-md hover:bg-white/70 disabled:opacity-60"
          >
            {cancelLabel}
          </button>
        ) : null}
      </div>
    </AnimatedDialog>
  );
}
