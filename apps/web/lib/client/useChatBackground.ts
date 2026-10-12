'use client';

import { useEffect, useState } from 'react';

/** Module-level: the URL lookup + image decode start once per page load and are shared, so opening the chat
 *  doesn't wait on a fresh API round-trip + image download (it used to start only on open). */
let bgPromise: Promise<string | null> | null = null;
function loadChatBackground(): Promise<string | null> {
  if (bgPromise) return bgPromise;
  bgPromise = fetch('/api/v1/chat-background')
    .then((r) => r.json())
    .then(
      (d: { url?: string | null; has_custom?: boolean }) =>
        new Promise<string | null>((resolve) => {
          if (!d.has_custom || !d.url) return resolve(null);
          const img = new Image();
          img.decoding = 'async';
          img.onload = () => resolve(d.url!);
          img.onerror = () => resolve(null);
          img.src = d.url!;
        })
    )
    .catch(() => null);
  return bgPromise;
}

/** Warm the chat background during idle time (called by the widget on mount). */
export function prefetchChatBackground(): void {
  if (typeof window === 'undefined') return;
  const run = () => void loadChatBackground();
  if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout: 4000 });
  else setTimeout(run, 1500);
}

type ChatBackgroundState = {
  url: string | null;
  ready: boolean;
  hasPhoto: boolean;
};

/** `enabled=false` — לא מושכים/preload רקע עד שהצ׳אט באמת נפתח. */
export function useChatBackground(enabled = true): ChatBackgroundState {
  const [url, setUrl] = useState<string | null>(null);
  const [ready, setReady] = useState(!enabled);
  const [hasPhoto, setHasPhoto] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setReady(false);
      return;
    }
    let cancelled = false;
    void loadChatBackground().then((u) => {
      if (cancelled) return;
      setUrl(u);
      setHasPhoto(Boolean(u));
      setReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { url, ready, hasPhoto };
}
