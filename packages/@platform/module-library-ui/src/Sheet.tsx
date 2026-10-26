'use client';
import { useEffect, useRef, useState } from 'react';

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"])';
const CLOSE_PX = 80;
const CLOSE_VELOCITY = 0.6; // px/ms

/**
 * Dialog that is a centered modal on desktop and a bottom sheet on mobile (≤640px, CSS-driven).
 * Escape / backdrop tap / drag-down (handle or sheet top) close it. Focus is trapped and body scroll locked.
 */
export function Sheet({ label, onClose, onSubmit, children }: { label: string; onClose: () => void; onSubmit?: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLElement | null>(null);
  const drag = useRef<{ y: number; t: number; id: number } | null>(null);
  const [dy, setDy] = useState(0);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const el = ref.current;
    const prevFocus = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    (el?.querySelector<HTMLElement>(FOCUSABLE) ?? el)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); closeRef.current(); return; }
      if (e.key !== 'Tab' || !el) return;
      const f = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((x) => x.offsetParent !== null);
      if (!f.length) { e.preventDefault(); return; }
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prevOverflow; prevFocus?.focus?.(); };
  }, []);

  const isSheet = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches;
  const down = (e: React.PointerEvent) => {
    if (!isSheet() || e.button !== 0) return;
    const el = ref.current;
    // only start from the handle, or from the sheet when it is scrolled to the top and not on a form control
    const fromHandle = (e.target as HTMLElement).closest('.fd-sheet-handle');
    if (!fromHandle && (el?.scrollTop ?? 0) > 0) return;
    if (!fromHandle && (e.target as HTMLElement).closest('input,select,textarea,button,summary,a,label')) return;
    drag.current = { y: e.clientY, t: performance.now(), id: e.pointerId };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const move = (e: React.PointerEvent) => { if (drag.current?.id === e.pointerId) setDy(Math.max(0, e.clientY - drag.current.y)); };
  const up = (e: React.PointerEvent) => {
    const d = drag.current; if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    const dist = Math.max(0, e.clientY - d.y), v = dist / Math.max(1, performance.now() - d.t);
    if (dist > CLOSE_PX || v > CLOSE_VELOCITY) onClose(); else setDy(0);
  };

  const common = {
    className: `fd-modal fd-form${dy ? ' is-dragging' : ''}`,
    role: 'dialog', 'aria-modal': true, 'aria-label': label, tabIndex: -1,
    style: dy ? { transform: `translateY(${dy}px)` } : undefined,
    onClick: (e: React.MouseEvent) => e.stopPropagation(),
    onPointerDown: down, onPointerMove: move, onPointerUp: up, onPointerCancel: up,
  } as const;
  const inner = (
    <>
      <div className="fd-sheet-handle" aria-hidden="true"><span /></div>
      <button type="button" className="fd-close" onClick={onClose} aria-label="סגירה">×</button>
      {children}
    </>
  );
  return (
    <div className="fd-modal-back" onClick={onClose}>
      {onSubmit
        ? <form {...common} ref={(n) => { ref.current = n; }} onSubmit={(e) => { e.preventDefault(); onSubmit(); }}>{inner}</form>
        : <div {...common} ref={(n) => { ref.current = n; }}>{inner}</div>}
    </div>
  );
}
