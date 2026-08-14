'use client';

import { useEffect } from 'react';

/**
 * Keeps the device screen on while `active` (e.g. lesson video playing).
 * No-ops on browsers without Screen Wake Lock API.
 */
export function useScreenWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || typeof navigator === 'undefined' || !('wakeLock' in navigator)) {
      return;
    }

    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    const request = async () => {
      try {
        sentinel = await navigator.wakeLock.request('screen');
        sentinel.addEventListener('release', () => {
          sentinel = null;
        });
      } catch {
        /* permission, battery saver, unsupported context */
      }
    };

    void request();

    const onVisibility = () => {
      if (cancelled) return;
      if (document.visibilityState === 'visible') void request();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      void sentinel?.release();
      sentinel = null;
    };
  }, [active]);
}
