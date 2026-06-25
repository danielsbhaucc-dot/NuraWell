'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import type { SosTtsCategory } from '../../lib/tts/sos-keys';

const TTS_FETCH_TIMEOUT_MS = 25_000;

export function useSosTts() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [loadingKey, setLoadingKey] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  const play = useCallback(async (text: string, category: SosTtsCategory) => {
    const trimmed = text.trim();
    if (!trimmed) return false;

    const key = `${category}:${trimmed}`;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoadingKey(key);
    try {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      audioRef.current?.pause();

      const timeout = window.setTimeout(() => controller.abort(), TTS_FETCH_TIMEOUT_MS);
      const res = await fetch('/api/v1/ai/sos/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: trimmed, category }),
        signal: controller.signal,
      });
      window.clearTimeout(timeout);

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
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
      setLoadingKey((current) => (current === key ? null : current));
    }
  }, []);

  const isLoading = useCallback(
    (text: string, category: SosTtsCategory) => loadingKey === `${category}:${text.trim()}`,
    [loadingKey]
  );

  return { play, isLoading, loadingKey };
}
