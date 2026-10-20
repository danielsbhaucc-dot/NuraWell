'use client';

import { useEffect, useRef } from 'react';

/**
 * Keeps an admin panel live without a page refresh: re-runs `refresh` every `intervalMs`
 * while the tab is visible, and immediately when the tab regains focus or comes back online.
 * Data still flows through the admin-guarded API routes (no client DB access, no RLS bypass).
 */
export function useLiveRefresh(refresh: () => unknown, intervalMs: number, enabled = true) {
  const fn = useRef(refresh);
  useEffect(() => { fn.current = refresh; }, [refresh]);
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;
    let last = Date.now();
    const run = () => { if (document.visibilityState !== 'visible') return; last = Date.now(); void fn.current(); };
    const id = window.setInterval(run, intervalMs);
    const onWake = () => { if (Date.now() - last > 2000) run(); };
    document.addEventListener('visibilitychange', onWake);
    window.addEventListener('focus', onWake);
    window.addEventListener('online', onWake);
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', onWake); window.removeEventListener('focus', onWake); window.removeEventListener('online', onWake); };
  }, [intervalMs, enabled]);
}
