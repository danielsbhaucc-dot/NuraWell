'use client';

import { useState } from 'react';
import { HeartPulse } from 'lucide-react';

import { SosDialog } from './SosDialog';

type SosFocusTask = {
  id: string;
  title: string;
  emoji?: string;
  stepTitle?: string;
  stepId?: string;
  pendingSlots?: string[];
};

type SosButtonProps = {
  focusTasks?: SosFocusTask[];
};

export function SosButton({ focusTasks = [] }: SosButtonProps) {
  const [open, setOpen] = useState(false);
  const pendingCount = focusTasks.length;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        dir="rtl"
        className="relative flex w-full items-center gap-3.5 p-4 text-right transition active:scale-[0.99] outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30"
        style={{
          borderRadius: '22px',
          background:
            'linear-gradient(165deg, rgba(209,250,229,0.82) 0%, rgba(167,243,208,0.58) 55%, rgba(110,231,183,0.42) 100%)',
          border: '1px solid rgba(5, 150, 105, 0.22)',
          boxShadow:
            'inset 0 1px 0 rgba(110, 231, 183, 0.35), 0 8px 24px rgba(6, 78, 59, 0.08)',
        }}
      >
        <span
          className="flex h-[52px] w-[52px] flex-shrink-0 items-center justify-center rounded-2xl"
          style={{
            background: 'linear-gradient(145deg, rgba(15,118,110,0.92), rgba(20,184,166,0.88))',
            boxShadow: '0 6px 18px rgba(15,118,110,0.28), inset 0 1px 0 rgba(255,255,255,0.22)',
          }}
        >
          <HeartPulse className="h-6 w-6 text-white" strokeWidth={2.4} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-black text-emerald-950">רגע, קשה לי עכשיו</span>
          <span className="mt-1 block text-xs font-semibold leading-5 text-emerald-900/65">
            {pendingCount > 0
              ? `סיוע קצר של אלמוג — ${pendingCount} משימות פתוחות על הראש`
              : 'סיוע קצר של אלמוג לפני שהרגע בורח.'}
          </span>
        </span>
      </button>

      <SosDialog open={open} onClose={() => setOpen(false)} focusTasks={focusTasks} />
    </>
  );
}
