'use client';

import { useEffect, useState } from 'react';
import { ConfirmDialog, type ConfirmDialogTone } from '@/components/admin/ConfirmDialog';

/**
 * תחליף מעוצב ל-window.alert / confirm / prompt.
 * שימוש: `if (!(await confirmDialog({ title: '...', danger: true }))) return;`
 * ה-<DialogHost /> מותקן פעם אחת ב-root layout.
 */
export type DialogOptions = {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  tone?: ConfirmDialogTone;
};

type Request =
  | { kind: 'confirm'; opts: DialogOptions; resolve: (v: boolean) => void }
  | { kind: 'alert'; opts: DialogOptions; resolve: (v: void) => void }
  | {
      kind: 'prompt';
      opts: DialogOptions & { defaultValue?: string; placeholder?: string };
      resolve: (v: string | null) => void;
    };

const queue: Request[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function enqueue(r: Request) {
  queue.push(r);
  emit();
}

export function confirmDialog(opts: DialogOptions): Promise<boolean> {
  return new Promise((resolve) => enqueue({ kind: 'confirm', opts, resolve }));
}

export function alertDialog(opts: DialogOptions): Promise<void> {
  return new Promise((resolve) => enqueue({ kind: 'alert', opts, resolve }));
}

export function promptDialog(
  opts: DialogOptions & { defaultValue?: string; placeholder?: string },
): Promise<string | null> {
  return new Promise((resolve) => enqueue({ kind: 'prompt', opts, resolve }));
}

export function DialogHost() {
  const [, force] = useState(0);
  const [value, setValue] = useState('');
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);

  const current = queue[0];
  const [shownFor, setShownFor] = useState<Request | null>(null);
  if (current && shownFor !== current) {
    setShownFor(current);
    setValue(current.kind === 'prompt' ? current.opts.defaultValue ?? '' : '');
  }

  const finish = (ok: boolean) => {
    const r = queue.shift();
    if (!r) return;
    if (r.kind === 'confirm') r.resolve(ok);
    else if (r.kind === 'alert') r.resolve();
    else r.resolve(ok ? value : null);
    emit();
  };

  const opts = current?.opts;
  return (
    <ConfirmDialog
      open={Boolean(current)}
      title={opts?.title ?? ''}
      message={opts?.message}
      confirmLabel={opts?.confirmLabel}
      cancelLabel={opts?.cancelLabel}
      danger={opts?.danger}
      tone={opts?.tone ?? (current?.kind === 'confirm' && !opts?.danger ? 'info' : undefined)}
      alert={current?.kind === 'alert'}
      input={
        current?.kind === 'prompt'
          ? { value, onChange: setValue, placeholder: current.opts.placeholder }
          : undefined
      }
      onConfirm={() => finish(true)}
      onCancel={() => finish(false)}
    />
  );
}
