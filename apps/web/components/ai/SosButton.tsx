'use client';

import { useState } from 'react';
import { HeartPulse } from 'lucide-react';

import { SosDialog } from './SosDialog';

export function SosButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        dir="rtl"
        className="glass-surface relative flex w-full items-center gap-3.5 overflow-hidden p-4 text-right transition active:scale-[0.99]"
        style={{
          borderRadius: '22px',
          border: '1px solid rgba(16,185,129,0.28)',
          boxShadow:
            '0 10px 28px rgba(4,120,87,0.12), inset 0 1px 0 rgba(255,255,255,0.55)',
        }}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-4 top-px h-px"
          style={{
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.85), transparent)',
          }}
        />
        <span
          className="flex h-[52px] w-[52px] flex-shrink-0 items-center justify-center rounded-2xl"
          style={{
            background: 'linear-gradient(145deg, #0f766e, #14b8a6)',
            boxShadow: '0 6px 18px rgba(15,118,110,0.28)',
          }}
        >
          <HeartPulse className="h-6 w-6 text-white" strokeWidth={2.4} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-black text-emerald-950">רגע, קשה לי עכשיו</span>
          <span className="mt-1 block text-xs font-semibold leading-5 text-emerald-800/70">
            סיוע קצר של אלמוג לפני שהרגע בורח.
          </span>
        </span>
      </button>

      <SosDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
