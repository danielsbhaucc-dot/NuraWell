'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import type { SosTtsCategory } from '../../lib/tts/sos-keys';

export function useSosTts() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [loadingKey, setLoadingKey] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  const play = useCallback(async (text: string, category: SosTtsCategory) => {
    const trimmed = text.trim();
    if (!trimmed) return false;

    const key = `${category}:${trimmed}`;
    setLoadingKey(key);
    try {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      audioRef.current?.pause();

      const res = await fetch('/api/v1/ai/sos/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: trimmed, category }),
      });
      const json = (await res.json()) as { ok?: boolean; url?: string; error?: string };
      if (!res.ok || !json.url) return false;

      if (!audioRef.current) {
        audioRef.current = new Audio();
      }
      audioRef.current.src = json.url;
      await audioRef.current.play();
      return true;
    } catch {
      return false;
    } finally {
      setLoadingKey(null);
    }
  }, []);

  const isLoading = useCallback(
    (text: string, category: SosTtsCategory) => loadingKey === `${category}:${text.trim()}`,
    [loadingKey]
  );

  return { play, isLoading, loadingKey };
}
