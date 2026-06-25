'use client';

import { AlertTriangle } from 'lucide-react';
import { AnimatedDialog } from '../shared/AnimatedDialog';
import { glassCardStyle } from './glass-styles';

type GlassConfirmDialogProps = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function GlassConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'אישור',
  cancelLabel = 'ביטול',
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: GlassConfirmDialogProps) {
  return (
    <AnimatedDialog
      open={open}
      onClose={() => !busy && onCancel()}
      zIndex={320}
      aria-labelledby="glass-confirm-title"
      backdropClassName="absolute inset-0 bg-slate-900/35 backdrop-blur-sm"
      panelClassName="max-w-md overflow-hidden rounded-2xl p-5 text-right"
      panelStyle={glassCardStyle}
    >
      <div className="mb-3 flex items-start gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
          style={{
            background: danger
              ? 'linear-gradient(135deg, rgba(239,68,68,0.35), rgba(185,28,28,0.2))'
              : 'linear-gradient(135deg, rgba(16,185,129,0.35), rgba(5,150,105,0.2))',
          }}
        >
          <AlertTriangle className={`h-5 w-5 ${danger ? 'text-red-200' : 'text-emerald-100'}`} />
        </div>
        <div>
          <p id="glass-confirm-title" className="text-base font-black text-slate-900">
            {title}
          </p>
          <p className="mt-1 text-sm text-slate-700">{message}</p>
        </div>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded-xl border border-white/55 bg-white/20 px-4 py-2 text-sm font-bold text-slate-800 backdrop-blur-sm disabled:opacity-50"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className={`rounded-xl px-4 py-2 text-sm font-bold text-white disabled:opacity-50 ${
            danger ? 'bg-red-600/90' : 'bg-emerald-700/90'
          }`}
        >
          {confirmLabel}
        </button>
      </div>
    </AnimatedDialog>
  );
}
