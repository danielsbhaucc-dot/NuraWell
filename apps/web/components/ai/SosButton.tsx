'use client';

import { useState } from 'react';
import { HandHeart } from 'lucide-react';

import { SosDialog } from './SosDialog';
import { SOS_HOME_BUTTON_STYLE, SOS_HOME_ICON_STYLE } from './sos-ui-styles';

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
        className="relative flex w-full items-center gap-3.5 p-4 text-right transition active:scale-[0.99] outline-none focus-visible:ring-2 focus-visible:ring-white/25"
        style={SOS_HOME_BUTTON_STYLE}
      >
        <span
          className="flex h-[52px] w-[52px] flex-shrink-0 items-center justify-center rounded-2xl"
          style={SOS_HOME_ICON_STYLE}
        >
          <HandHeart className="h-6 w-6 text-rose-200/95" strokeWidth={2.2} />
        </span>
        <span className="min-w-0 flex-1">
          <span
            className="block text-[15px] font-black text-[#f5f5f7]"
            style={{ fontFamily: "'Rubik','Heebo',sans-serif" }}
          >
            רגע, קשה לי עכשיו
          </span>
          <span className="mt-1 block text-xs font-semibold leading-5 text-white/62">
            {pendingCount > 0
              ? `אלמוג כאן — ${pendingCount} משימות פתוחות על הראש`
              : 'עצור רגע. אלמוג איתך, בלי לחץ.'}
          </span>
        </span>
      </button>

      <SosDialog open={open} onClose={() => setOpen(false)} focusTasks={focusTasks} />
    </>
  );
}
