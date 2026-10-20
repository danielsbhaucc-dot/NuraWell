'use client';

import { useEffect, useId, useRef, useState } from 'react';

export const EDITED_EXPLANATION = 'אלמוג תיקן ניסוח קטן אחרי השליחה';

/**
 * "נערכה" pill on an Almog bubble. Dark emerald bg + cream text (~10:1 contrast), no italic.
 * Tap/click toggles a small inline popover (no native dialogs); Escape / outside tap closes it.
 */
export function EditedBadge() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const popId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    const t = window.setTimeout(() => setOpen(false), 6000);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
      window.clearTimeout(t);
    };
  }, [open]);

  return (
    <span ref={ref} className="relative me-1.5 inline-flex align-middle">
      <button
        type="button"
        aria-label={`נערכה: ${EDITED_EXPLANATION}`}
        aria-expanded={open}
        aria-controls={popId}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex min-h-[22px] items-center rounded-full px-2 py-0.5 text-[11px] font-semibold not-italic leading-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#fef3c7]"
        style={{ background: '#064e3b', color: '#fef3c7', border: '1px solid rgba(254,243,199,0.35)' }}
      >
        נערכה
      </button>
      {open ? (
        <span
          id={popId}
          role="status"
          className="absolute bottom-full start-0 z-20 mb-1.5 w-max max-w-[220px] rounded-xl px-3 py-2 text-[12px] font-medium leading-snug shadow-lg"
          style={{ background: '#fffbeb', color: '#064e3b', border: '1px solid #a7f3d0' }}
        >
          {EDITED_EXPLANATION}
        </span>
      ) : null}
    </span>
  );
}
