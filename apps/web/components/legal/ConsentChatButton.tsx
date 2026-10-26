'use client';

import { HeartPulse, ShieldCheck } from 'lucide-react';
import { openConsentSheet } from './ConsentSheetHost';

/** Inline button under Almog's explanation. The user opens the sheet when ready (no auto-open). */
export function ConsentChatButton({ action, onOpen }: { action: 'grant' | 'withdraw'; onOpen: () => void }) {
  return (
    <div dir="rtl" className="flex justify-end pe-10" data-testid="consent-chat-button">
      <button
        type="button"
        onClick={() => {
          onOpen();
          openConsentSheet({ action, source: 'chat' });
        }}
        className="group inline-flex min-h-11 items-center gap-2 rounded-2xl border border-accent-200/80 bg-[linear-gradient(135deg,rgba(242,242,246,0.95),rgba(242,242,246,0.95))] px-4 py-2.5 text-sm font-bold text-primary-800 shadow-md shadow-accent-900/5 backdrop-blur transition hover:shadow-lg active:scale-[0.98]"
      >
        <span className="grid h-7 w-7 place-items-center rounded-xl bg-gradient-to-br from-primary-500 to-secondary-500 text-on-dark">
          {action === 'withdraw' ? <ShieldCheck className="h-4 w-4" aria-hidden /> : <HeartPulse className="h-4 w-4" aria-hidden />}
        </span>
        {action === 'withdraw' ? 'לפתיחת חלון ביטול ההסכמה' : 'לפתיחת חלון ההסכמה'}
      </button>
    </div>
  );
}
