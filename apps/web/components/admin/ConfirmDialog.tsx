'use client';

import { useEffect } from 'react';
import { AlertTriangle, Loader2, X } from 'lucide-react';

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'default';
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'אישור',
  cancelLabel = 'ביטול',
  variant = 'default',
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, loading, onCancel]);

  if (!open) return null;

  const isDanger = variant === 'danger';

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4" role="presentation">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/55 backdrop-blur-[3px]"
        aria-label="סגירה"
        disabled={loading}
        onClick={onCancel}
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-desc"
        dir="rtl"
        className="relative w-full max-w-md rounded-2xl border border-white/80 bg-white shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={[
            'px-5 py-4 flex items-start gap-3',
            isDanger ? 'bg-gradient-to-l from-red-50 to-orange-50' : 'bg-gradient-to-l from-emerald-50 to-teal-50',
          ].join(' ')}
        >
          <span
            className={[
              'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl',
              isDanger ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-800',
            ].join(' ')}
            aria-hidden
          >
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1 pt-0.5">
            <h2 id="confirm-dialog-title" className="text-lg font-black text-slate-900">
              {title}
            </h2>
            <p
              id="confirm-dialog-desc"
              className="text-sm text-slate-600 mt-1.5 leading-relaxed whitespace-pre-line"
            >
              {description}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-white/80 hover:text-slate-700 disabled:opacity-40"
            aria-label="סגור"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-row-reverse gap-2 px-5 py-4 bg-white border-t border-slate-100">
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={[
              'flex-1 inline-flex items-center justify-center gap-2 rounded-xl py-2.5 font-bold text-white disabled:opacity-60',
              isDanger ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700',
            ].join(' ')}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {confirmLabel}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="flex-1 rounded-xl border border-slate-200 py-2.5 font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
