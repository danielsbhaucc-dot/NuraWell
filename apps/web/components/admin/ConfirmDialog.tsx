'use client';

import { useEffect } from 'react';
import { AlertTriangle, Loader2, X } from 'lucide-react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** מראה "מסוכן" (מחיקה) — כפתור אישור אדום. */
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** פופאפ אישור בעיצוב זכוכית שקוף — מחליף את confirm()/alert המובנה. */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'אישור',
  cancelLabel = 'ביטול',
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel();
      if (e.key === 'Enter' && !busy) onConfirm();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, busy, onCancel, onConfirm]);

  if (!open) return null;

  return (
    <div
      dir="rtl"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
    >
      {/* רקע מטושטש שקוף */}
      <button
        type="button"
        aria-label="סגור"
        onClick={() => !busy && onCancel()}
        className="absolute inset-0 cursor-default bg-slate-900/30 backdrop-blur-sm"
      />

      {/* כרטיס זכוכית */}
      <div className="relative w-full max-w-sm overflow-hidden rounded-3xl border border-white/40 bg-white/20 p-5 shadow-[0_20px_60px_-12px_rgba(15,23,42,0.5)] ring-1 ring-inset ring-white/30 backdrop-blur-2xl backdrop-saturate-150">
        {/* נצנוץ עליון */}
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
              danger
                ? 'border-red-300/60 bg-red-100/70 text-red-600'
                : 'border-emerald-300/60 bg-emerald-100/70 text-emerald-700',
            ].join(' ')}
          >
            <AlertTriangle className="h-5 w-5" />
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
              danger
                ? 'bg-gradient-to-l from-red-600 to-rose-500 shadow-red-500/25'
                : 'bg-gradient-to-l from-emerald-600 to-teal-500 shadow-emerald-500/25',
            ].join(' ')}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {confirmLabel}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="inline-flex items-center justify-center rounded-xl border border-white/60 bg-white/40 px-4 py-2.5 text-sm font-bold text-slate-700 backdrop-blur-md hover:bg-white/70 disabled:opacity-60"
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
