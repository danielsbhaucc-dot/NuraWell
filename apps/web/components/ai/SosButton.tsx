'use client';

import { useState } from 'react';
import { HandHeart } from 'lucide-react';

import type { OnboardingGender } from '../../lib/onboarding/types';
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
  firstName?: string;
  gender?: OnboardingGender | '';
};

export function SosButton({ focusTasks = [], firstName = '', gender = '' }: SosButtonProps) {
  const [open, setOpen] = useState(false);
  const [sessionKey, setSessionKey] = useState(0);
  const [gateOnOpen, setGateOnOpen] = useState(false);
  const pendingCount = focusTasks.length;

  function openDialog() {
    setGateOnOpen(pendingCount > 0);
    setSessionKey((k) => k + 1);
    setOpen(true);
  }

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        dir="rtl"
        className="touch-manipulation relative flex w-full items-center gap-3.5 p-4 text-right transition active:scale-[0.99] outline-none focus-visible:ring-2 focus-visible:ring-violet-400/35"
        style={{
          borderRadius: '22px',
          background: 'linear-gradient(165deg, #ffffff 0%, #faf7f4 55%, #f3f0ff 100%)',
          border: '1px solid rgba(148, 130, 180, 0.18)',
          boxShadow:
            'inset 0 1px 0 rgba(255,255,255,0.95), 0 8px 28px rgba(55, 45, 75, 0.07)',
        }}
      >
        <span
          className="flex h-[52px] w-[52px] flex-shrink-0 items-center justify-center rounded-2xl"
          style={{
            background: 'linear-gradient(145deg, #a78bfa 0%, #8b5cf6 55%, #7c3aed 100%)',
            boxShadow: '0 6px 18px rgba(124, 58, 237, 0.28), inset 0 1px 0 rgba(255,255,255,0.25)',
          }}
        >
          <HandHeart className="h-6 w-6 text-white" strokeWidth={2.2} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-black text-slate-800">רגע, קשה לי עכשיו</span>
          <span className="mt-1 block text-xs font-semibold leading-5 text-slate-600">
            {pendingCount > 0
              ? `אלמוג כאן — ${pendingCount} משימות פתוחות על הראש`
              : 'אלמוג כאן לרגע קצר, לפני שהרגע בורח.'}
          </span>
        </span>
      </button>

      <SosDialog
        key={sessionKey}
        open={open}
        onClose={() => setOpen(false)}
        focusTasks={focusTasks}
        pendingTaskCount={pendingCount}
        gateOnOpen={gateOnOpen}
        firstName={firstName}
        gender={gender}
      />
    </>
  );
}
