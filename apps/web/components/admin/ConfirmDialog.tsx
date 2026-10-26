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
  /** מצב קלט (מחליף window.prompt) — שדה טקסט מעוצב. */
  input?: { value: string; onChange: (v: string) => void; placeholder?: string; label?: string };
  onConfirm: () => void;
  onCancel: () => void;
}

const TONE_STYLES: Record<
  ConfirmDialogTone,
  { iconWrap: string; btn: string; Icon: typeof AlertTriangle }
> = {
  danger: {
    iconWrap: 'border-coral-300/60 bg-coral-100/70 text-coral-600',
    btn: 'bg-linear-to-l from-coral-600 to-coral-500 shadow-coral-500/25',
    Icon: AlertTriangle,
  },
  warning: {
    iconWrap: 'border-accent-300/60 bg-accent-100/70 text-accent-700',
    btn: 'bg-linear-to-l from-accent-600 to-energy-500 shadow-accent-500/25',
    Icon: AlertTriangle,
  },
  success: {
    iconWrap: 'border-primary-300/60 bg-primary-100/70 text-primary-700',
    btn: 'bg-linear-to-l from-primary-600 to-secondary-500 shadow-primary-500/25',
    Icon: CheckCircle2,
  },
  info: {
    iconWrap: 'border-iris-300/60 bg-iris-100/70 text-iris-700',
    btn: 'bg-linear-to-l from-iris-600 to-iris-500 shadow-iris-500/25',
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
  input,
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
      backdropClassName="absolute inset-0 cursor-default bg-ink-900/30 backdrop-blur-sm"
      panelClassName="max-w-sm overflow-hidden rounded-3xl border border-gc/40 bg-background-card/20 p-5 shadow-[0_20px_60px_-12px_rgba(15,23,42,0.5)] ring-1 ring-inset ring-gc/30 backdrop-blur-2xl backdrop-saturate-150"
    >
      <div className="pointer-events-none absolute inset-x-4 top-0 h-px bg-linear-to-r from-transparent via-background-card/80 to-transparent" />

      <button
        type="button"
        onClick={() => !busy && onCancel()}
        aria-label="סגור"
        className="absolute inset-e-3 top-3 inline-flex h-7 w-7 items-center justify-center rounded-lg border border-gc/50 bg-background-card/40 text-ink-soft hover:bg-background-card/70"
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
          <h3 className="text-base font-black text-ink">{title}</h3>
          {message && <p className="mt-1 text-sm leading-snug text-ink-soft">{message}</p>}
        </div>
      </div>

      {input ? (
        <form
          className="mt-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!busy) onConfirm();
          }}
        >
          <label className="sr-only" htmlFor="confirm-dialog-input">
            {input.label ?? title}
          </label>
          <input
            id="confirm-dialog-input"
            data-autofocus
            dir="auto"
            value={input.value}
            placeholder={input.placeholder}
            onChange={(e) => input.onChange(e.target.value)}
            className="w-full rounded-xl border border-gc/60 bg-background-card/60 px-3 py-2.5 text-base text-ink shadow-inner outline-hidden backdrop-blur-md placeholder:text-ink-faint focus:ring-2 focus:ring-secondary-400/60"
          />
        </form>
      ) : null}

      <div className="mt-5 flex gap-2">
        <button
          type="button"
          {...(!input ? { 'data-autofocus': true } : {})}
          onClick={onConfirm}
          disabled={busy}
          className={[
            'inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-black text-gc shadow-lg disabled:opacity-60',
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
            className="inline-flex items-center justify-center rounded-xl border border-gc/60 bg-background-card/40 px-4 py-2.5 text-sm font-bold text-ink-soft backdrop-blur-md hover:bg-background-card/70 disabled:opacity-60"
          >
            {cancelLabel}
          </button>
        ) : null}
      </div>
    </AnimatedDialog>
  );
}
