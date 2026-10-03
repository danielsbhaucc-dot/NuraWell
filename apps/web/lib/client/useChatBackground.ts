'use client';

import { useEffect, useState } from 'react';

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

    void fetch('/api/v1/chat-background')
      .then((r) => r.json())
      .then((d: { url?: string | null; has_custom?: boolean }) => {
        if (cancelled) return;
        if (!d.has_custom || !d.url) {
          setHasPhoto(false);
          setReady(true);
          return;
        }
        const img = new Image();
        img.onload = () => {
          if (!cancelled) {
            setUrl(d.url!);
            setHasPhoto(true);
            setReady(true);
          }
        };
        img.onerror = () => {
          if (!cancelled) {
            setHasPhoto(false);
            setReady(true);
          }
        };
        img.src = d.url!;
      })
      .catch(() => {
        if (!cancelled) {
          setHasPhoto(false);
          setReady(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { url, ready, hasPhoto };
}
