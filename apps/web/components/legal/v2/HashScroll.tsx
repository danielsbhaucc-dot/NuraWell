'use client';

import { useEffect } from 'react';

/**
 * Lands a deep link like /terms#payments on its section. The browser's own hash jump runs before hydration with
 * `scroll-behavior: smooth` on <html>, and the smooth scroll gets cut off as the page hydrates and grows, so the
 * reader stayed near the top (or, on a short landscape viewport, overshot the section). This re-aligns instantly
 * (CSS scroll-margin-top on .ld-sec still applies) on mount, after web fonts load and after the load event, and
 * stops as soon as the reader scrolls or taps on their own.
 */
export function HashScroll() {
  useEffect(() => {
    let userMoved = false;
    const stop = () => {
      userMoved = true;
    };
    const align = () => {
      if (userMoved) return;
      let id = '';
      try {
        id = decodeURIComponent(window.location.hash.slice(1));
      } catch {
        return;
      }
      const el = id ? document.getElementById(id) : null;
      if (!el) return;
      const html = document.documentElement;
      const prev = html.style.scrollBehavior;
      html.style.scrollBehavior = 'auto';
      el.scrollIntoView({ block: 'start', behavior: 'auto' });
      html.style.scrollBehavior = prev;
    };
    const opts = { passive: true, once: true } as const;
    for (const ev of ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const) window.addEventListener(ev, stop, opts);
    const raf = requestAnimationFrame(() => {
      align();
      requestAnimationFrame(align);
    });
    void document.fonts?.ready.then(align);
    window.addEventListener('load', align, { once: true });
    const later = window.setTimeout(align, 250);
    const last = window.setTimeout(align, 800);
    const onHash = () => {
      userMoved = false;
      align();
    };
    window.addEventListener('hashchange', onHash);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(later);
      window.clearTimeout(last);
      window.removeEventListener('load', align);
      window.removeEventListener('hashchange', onHash);
      for (const ev of ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const) window.removeEventListener(ev, stop);
    };
  }, []);
  return null;
}
