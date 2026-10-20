'use client';

import { REDACTED_PLACEHOLDER } from '@/lib/privacy/health-chat-redaction';

/** Placeholder for a user message Almog deleted (health info without consent). */
export function DeletedMessageBubble({ text, time }: { text: string; time: string }) {
  const reason = text.slice(REDACTED_PLACEHOLDER.length).replace(/^\s*·\s*/, '').trim();
  return (
    <div
      className="max-w-[82%] rounded-[20px] rounded-ss-md px-3.5 py-2.5 text-[13px] text-slate-300"
      style={{
        background: 'rgba(30,41,59,0.55)',
        border: '1px dashed rgba(148,163,184,0.35)',
      }}
      role="note"
      aria-label={REDACTED_PLACEHOLDER}
    >
      <p className="flex items-center gap-1.5 italic">
        <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="9" />
          <path d="M5.6 5.6l12.8 12.8" />
        </svg>
        {REDACTED_PLACEHOLDER}
      </p>
      {reason && <p className="mt-0.5 text-[11px] text-slate-400">{reason}</p>}
      <div className="mt-1 text-end text-[10px] text-slate-500">{time}</div>
    </div>
  );
}
