'use client';

import { CornerUpLeft } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';

const SWIPE_PX = 56;
const LONG_PRESS_MS = 480;

/**
 * Lets the user quote an Almog bubble: swipe right (touch), long-press, or hover "הגב" (desktop).
 * Purely client UX — the server re-validates the quoted id (same user + session, assistant row).
 */
export function QuoteSwipe({ children, onQuote, disabled }: { children: ReactNode; onQuote: () => void; disabled?: boolean }) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const timer = useRef<number | null>(null);
  const fired = useRef(false);
  const [dx, setDx] = useState(0);

  const clear = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
  };
  const fire = () => {
    if (fired.current || disabled) return;
    fired.current = true;
    try {
      navigator.vibrate?.(8);
    } catch {
      /* ignore */
    }
    onQuote();
  };

  return (
    <div
      className="group/quote relative flex max-w-[82%] items-center gap-1.5"
      onTouchStart={(e) => {
        if (disabled) return;
        const t = e.touches[0]!;
        start.current = { x: t.clientX, y: t.clientY };
        fired.current = false;
        clear();
        timer.current = window.setTimeout(fire, LONG_PRESS_MS);
      }}
      onTouchMove={(e) => {
        if (!start.current) return;
        const t = e.touches[0]!;
        const mx = t.clientX - start.current.x;
        const my = t.clientY - start.current.y;
        if (Math.abs(mx) > 8 || Math.abs(my) > 8) clear();
        if (Math.abs(my) > 24 && Math.abs(my) > Math.abs(mx)) {
          start.current = null;
          setDx(0);
          return;
        }
        setDx(Math.max(0, Math.min(mx, SWIPE_PX + 16)));
      }}
      onTouchEnd={() => {
        clear();
        if (dx >= SWIPE_PX) fire();
        start.current = null;
        setDx(0);
      }}
      onTouchCancel={() => {
        clear();
        start.current = null;
        setDx(0);
      }}
      onContextMenu={(e) => {
        if (disabled) return;
        e.preventDefault();
        fired.current = false;
        fire();
      }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute -left-8 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-amber-200/25 bg-emerald-950/60 text-amber-200 backdrop-blur-md"
        style={{ opacity: Math.min(1, dx / SWIPE_PX), transform: `translateY(-50%) scale(${0.6 + Math.min(0.4, dx / (SWIPE_PX * 2.5))})` }}
      >
        <CornerUpLeft className="h-3.5 w-3.5" />
      </span>
      <div
        className="min-w-0 transition-transform duration-150 motion-reduce:transition-none"
        style={{ transform: dx ? `translateX(${dx}px)` : undefined }}
      >
        {children}
      </div>
      {!disabled ? (
        <button
          type="button"
          onClick={() => {
            fired.current = false;
            fire();
          }}
          aria-label="הגב להודעה הזו"
          data-testid="quote-almog-btn"
          className="hidden shrink-0 items-center gap-1 rounded-full border border-emerald-300/20 bg-emerald-950/55 px-2 py-1 text-[11px] font-bold text-emerald-100 opacity-0 backdrop-blur-md transition hover:text-amber-200 focus-visible:opacity-100 group-hover/quote:opacity-100 motion-reduce:transition-none md:inline-flex"
        >
          <CornerUpLeft className="h-3 w-3" aria-hidden />
          הגב
        </button>
      ) : null}
    </div>
  );
}

/** Quote preview above the composer, with cancel. */
export function ComposerQuotePreview({ text, onCancel }: { text: string; onCancel: () => void }) {
  return (
    <div
      dir="rtl"
      data-testid="composer-quote"
      className="mb-2 flex items-stretch overflow-hidden rounded-2xl border border-amber-200/15"
      style={{
        background: 'linear-gradient(160deg, rgba(6,78,59,0.55), rgba(2,44,34,0.45))',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        boxShadow: 'inset 0 1px 0 rgba(236,253,245,0.08)',
      }}
    >
      <span aria-hidden className="w-[3px] shrink-0 bg-gradient-to-b from-amber-300 to-emerald-300" />
      <div className="min-w-0 flex-1 px-3 py-2">
        <p className="flex items-center gap-1 text-[11px] font-bold text-amber-200">
          <CornerUpLeft className="h-3 w-3" aria-hidden />
          תגובה לאלמוג
        </p>
        <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-emerald-50/85">{text}</p>
      </div>
      <button
        type="button"
        onClick={onCancel}
        aria-label="ביטול הציטוט"
        className="px-3 text-[18px] leading-none text-emerald-100/70 transition hover:text-white motion-reduce:transition-none"
      >
        ×
      </button>
    </div>
  );
}
