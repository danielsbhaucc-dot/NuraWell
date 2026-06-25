'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import type { SosTtsCategory } from '../../lib/tts/sos-keys';

const TTS_FETCH_TIMEOUT_MS = 25_000;

function ttsCacheKey(text: string, category: SosTtsCategory): string {
  return `${category}:${text.trim()}`;
}

export function useSosTts() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const urlCacheRef = useRef<Map<string, string>>(new Map());
  const [loadingKey, setLoadingKey] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  const playFromUrl = useCallback(async (url: string) => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
    }
    audioRef.current.src = url;
    await audioRef.current.play();
    return true;
  }, []);

  const play = useCallback(
    async (text: string, category: SosTtsCategory) => {
      const trimmed = text.trim();
      if (!trimmed) return false;

      const key = ttsCacheKey(trimmed, category);
      const cachedUrl = urlCacheRef.current.get(key);
      if (cachedUrl) {
        try {
          if (typeof window !== 'undefined' && window.speechSynthesis) {
            window.speechSynthesis.cancel();
          }
          audioRef.current?.pause();
          abortRef.current?.abort();
          abortRef.current = null;
          return await playFromUrl(cachedUrl);
        } catch {
          return false;
        }
      }

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

        const json = (await res.json()) as {
          ok?: boolean;
          url?: string;
          cached?: boolean;
          error?: string;
        };
        if (!res.ok || !json.url) return false;

        urlCacheRef.current.set(key, json.url);
        return await playFromUrl(json.url);
      } catch {
        return false;
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
        setLoadingKey((current) => (current === key ? null : current));
      }
    },
    [playFromUrl]
  );

  const isLoading = useCallback(
    (text: string, category: SosTtsCategory) => loadingKey === ttsCacheKey(text, category),
    [loadingKey]
  );

  return { play, isLoading, loadingKey };
}
