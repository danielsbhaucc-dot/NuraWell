// Local copy of @core/sheet-swipe (kept in-kit so the kit drops into a product with no workspace deps).
// Swipe-down-to-dismiss for bottom sheets (TikTok / iOS style). One hook for every sheet in the console.
// Pointer events (touch + mouse + pen). A drag starts from the handle or header anywhere, or from the content only while
// the scroll area is at the top and the first movement is downward, so inner scrolling is never hijacked.
// The sheet follows the finger 1:1, with rubber-band resistance upward; the backdrop fades with distance.
// Release past `threshold` (fraction of the sheet height, default 0.3) or a fast downward flick (`velocity` px/ms) dismisses;
// otherwise the sheet springs back. prefers-reduced-motion: no animation, same thresholds. Works the same in RTL (vertical only).
// Usage: const off = swipeToDismiss({ sheet, backdrop, scroller, drag: '.handle, header', onDismiss }); call off() when removing.
export interface SwipeOpts {
  sheet: HTMLElement; backdrop?: HTMLElement | null; scroller?: HTMLElement | null;
  /** Selector for zones that always start a drag (handle, header). */ drag?: string;
  onDismiss: () => void; threshold?: number; velocity?: number;
}
const reduced = (): boolean => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const EASE = 'cubic-bezier(.22,1,.36,1)';

export function swipeToDismiss(o: SwipeOpts): () => void {
  const { sheet, backdrop = null, drag = '[data-swipe-handle]', onDismiss } = o, scroller = o.scroller ?? sheet;
  const TH = o.threshold ?? 0.3, VEL = o.velocity ?? 0.5;
  const baseBg = backdrop ? getComputedStyle(backdrop).backgroundColor : '';
  const m = baseBg.match(/rgba?\(([^)]+)\)/), parts = m?.[1]?.split(',').map((s) => parseFloat(s)) ?? [];
  const [r = 17, g = 19, b = 23, a0 = parts.length > 3 ? (parts[3] ?? 1) : 1] = parts;
  let st: { id: number; y0: number; x0: number; zone: boolean; on: boolean; h: number; samples: [number, number][] } | null = null, dy = 0, done = false, moved = false;
  const paint = (y: number): void => {
    sheet.style.transform = y ? `translate3d(0,${y}px,0)` : '';
    if (backdrop) { const p = Math.max(0, Math.min(1, y / (st?.h || sheet.offsetHeight || 1))); backdrop.style.backgroundColor = y > 0 ? `rgba(${r},${g},${b},${(a0 * (1 - p)).toFixed(3)})` : ''; }
  };
  const anim = (ms: number, ease: string): void => { const t = reduced() ? 'none' : `transform ${ms}ms ${ease}`; sheet.style.transition = t; if (backdrop) backdrop.style.transition = reduced() ? 'none' : `background-color ${ms}ms ${ease}`; };
  const dismiss = (): void => { if (done) return; done = true; sheet.setAttribute('data-swipe', 'closing');
    const h = sheet.offsetHeight || 600; anim(220, 'cubic-bezier(.4,0,1,1)'); paint(h + 24);
    if (reduced()) onDismiss(); else { let fired = false; const fin = (): void => { if (!fired) { fired = true; onDismiss(); } }; sheet.addEventListener('transitionend', fin, { once: true }); setTimeout(fin, 260); } };
  const springBack = (): void => { anim(340, EASE); paint(0); sheet.removeAttribute('data-swipe'); };

  const down = (e: PointerEvent): void => {
    if (done || st || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const t = e.target as HTMLElement, zone = !!t.closest(drag);
    if (!zone && scroller.scrollTop > 0) return;
    if (!zone && t.closest('input,textarea,select,[contenteditable]')) return;
    st = { id: e.pointerId, y0: e.clientY, x0: e.clientX, zone, on: false, h: sheet.offsetHeight || 1, samples: [[e.timeStamp, e.clientY]] }; dy = 0; moved = false;
  };
  const move = (e: PointerEvent): void => {
    if (!st || e.pointerId !== st.id) return;
    const d = e.clientY - st.y0, dx = e.clientX - st.x0;
    if (!st.on) {
      if (Math.abs(d) < 6 && Math.abs(dx) < 6) return;
      if (Math.abs(dx) > Math.abs(d) || (!st.zone && (d < 0 || scroller.scrollTop > 0))) { st = null; return; } // horizontal, or scrolling content
      st.on = true; moved = true; st.y0 = e.clientY - Math.sign(d) * 6; sheet.setAttribute('data-swipe', 'dragging'); sheet.style.transition = 'none'; if (backdrop) backdrop.style.transition = 'none';
      try { sheet.setPointerCapture(e.pointerId); } catch { /* already released */ }
    }
    const raw = e.clientY - st.y0; dy = raw >= 0 ? raw : -Math.pow(-raw, 0.62); // upward = rubber band
    st.samples.push([e.timeStamp, e.clientY]); if (st.samples.length > 6) st.samples.shift();
    paint(dy); e.preventDefault();
  };
  const up = (e: PointerEvent): void => {
    if (!st || e.pointerId !== st.id) return; const s = st; st = null; if (!s.on) return;
    const last = s.samples[s.samples.length - 1] ?? [e.timeStamp, e.clientY], first = s.samples.find(([t]) => last[0] - t <= 120) ?? last;
    const stale = e.timeStamp - last[0] > 120, v = stale ? 0 : (last[1] - first[1]) / Math.max(1, last[0] - first[0]); // px/ms over the last ~120ms
    if (e.type !== 'pointercancel' && (dy > s.h * TH || (v > VEL && dy > 24))) dismiss(); else springBack();
  };
  // Touch: once a drag is live, stop the browser from also panning/overscrolling (otherwise it would cancel the pointer).
  const tmove = (e: TouchEvent): void => { if (st?.on && e.cancelable) e.preventDefault(); };
  const click = (e: MouseEvent): void => { if (moved) { e.stopPropagation(); e.preventDefault(); moved = false; } };
  const key = (e: KeyboardEvent): void => { const t = e.target as HTMLElement; if ((e.key === 'Enter' || e.key === ' ') && t.matches('[data-swipe-handle]')) { e.preventDefault(); dismiss(); } };
  sheet.addEventListener('pointerdown', down); sheet.addEventListener('pointermove', move); sheet.addEventListener('pointerup', up); sheet.addEventListener('pointercancel', up);
  sheet.addEventListener('touchmove', tmove, { passive: false }); sheet.addEventListener('click', click, true); sheet.addEventListener('keydown', key);
  return () => { sheet.removeEventListener('pointerdown', down); sheet.removeEventListener('pointermove', move); sheet.removeEventListener('pointerup', up); sheet.removeEventListener('pointercancel', up);
    sheet.removeEventListener('touchmove', tmove); sheet.removeEventListener('click', click, true); sheet.removeEventListener('keydown', key); };
}
/** Accessible handle markup: a real button (Enter/Space closes too), shown only where the sheet is a bottom sheet. */
export const swipeHandle = (cls: string, label = 'סגירה · אפשר לגרור למטה'): string => `<button type="button" class="${cls}" data-swipe-handle aria-label="${label}"><span aria-hidden="true"></span></button>`;
