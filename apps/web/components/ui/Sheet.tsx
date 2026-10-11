'use client';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { cn } from './cn';

/** Accessible bottom sheet / dialog built on <dialog> (focus trap + Esc handled by the browser). */
export function Sheet({ open, onClose, title, children, className }: { open: boolean; onClose: () => void; title: string; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={cn(
        'm-0 mt-auto w-full max-w-none rounded-t-3xl bg-white p-0 backdrop:bg-black/40 sm:m-auto sm:max-w-lg sm:rounded-3xl',
        className
      )}
    >
      <div className="flex flex-col gap-3 p-5">
        <h2 id={titleId} className="text-lg font-bold text-primary-900">
          {title}
        </h2>
        {children}
      </div>
    </dialog>
  );
}

export const Dialog = Sheet;
