'use client';

import { CornerUpLeft } from 'lucide-react';

/**
 * WhatsApp-style quote shown above Almog's reply. The snippet comes from the already-decrypted
 * original on the client (never stored). Tap scrolls to the original and highlights it briefly.
 */
export function ReplyQuoteBubble({
  text,
  deleted,
  onJump,
  author = 'ההודעה שלך',
  testId = 'almog-reply-quote',
}: {
  text: string | null;
  deleted: boolean;
  onJump?: () => void;
  author?: string;
  testId?: string;
}) {
  const body = deleted || !text ? 'ההודעה נמחקה' : text;
  return (
    <button
      type="button"
      dir="rtl"
      onClick={deleted ? undefined : onJump}
      disabled={deleted || !onJump}
      aria-label={deleted ? 'ציטוט של הודעה שנמחקה' : `מעבר להודעה המצוטטת: ${body}`}
      data-testid={testId}
      className="mb-2 block w-full overflow-hidden rounded-[14px] text-right transition active:scale-[0.99] disabled:cursor-default motion-reduce:transition-none"
      style={{
        background: 'linear-gradient(160deg, rgba(6,78,59,0.42), rgba(2,44,34,0.34))',
        border: '1px solid rgba(253,230,138,0.18)',
        boxShadow: 'inset 0 1px 0 rgba(236,253,245,0.10)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
      }}
    >
      <span className="flex">
        <span aria-hidden className="w-[3px] shrink-0 bg-gradient-to-b from-amber-300 to-emerald-300" />
        <span className="min-w-0 flex-1 px-2.5 py-1.5">
          <span className="flex items-center gap-1 text-[11px] font-bold text-amber-200">
            <CornerUpLeft className="h-3 w-3" aria-hidden />
            {author}
          </span>
          <span
            className={`mt-0.5 line-clamp-2 whitespace-pre-wrap text-[13px] leading-snug ${deleted ? 'italic text-emerald-100/60' : 'text-emerald-50/90'}`}
          >
            {body}
          </span>
        </span>
      </span>
    </button>
  );
}
