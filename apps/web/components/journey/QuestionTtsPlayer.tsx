'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX, RotateCcw } from 'lucide-react';

export const QUESTION_TTS_MUTE_KEY = 'nura-question-tts-muted';

interface QuestionTtsPlayerProps {
  /** CDN URL with cache buster (?v=hash). */
  audioUrl?: string | null;
  /** Changes when question changes — triggers auto-play. */
  playbackKey: string;
  /** Called when TTS starts/stops — used to duck background music. */
  onPlayingChange?: (playing: boolean) => void;
  className?: string;
}

export function QuestionTtsPlayer({
  audioUrl,
  playbackKey,
  onPlayingChange,
  className,
}: QuestionTtsPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [muted, setMuted] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [needsGesture, setNeedsGesture] = useState(false);
  const [replayTick, setReplayTick] = useState(0);

  useEffect(() => {
    try {
      setMuted(localStorage.getItem(QUESTION_TTS_MUTE_KEY) === '1');
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  const setPlayingState = useCallback(
    (next: boolean) => {
      setPlaying(next);
      onPlayingChange?.(next);
    },
    [onPlayingChange]
  );

  const playAudio = useCallback(async () => {
    const a = audioRef.current;
    if (!a || !audioUrl || muted) return;
    a.currentTime = 0;
    try {
      await a.play();
      setNeedsGesture(false);
      setPlayingState(true);
    } catch {
      setNeedsGesture(true);
      setPlayingState(false);
    }
  }, [audioUrl, muted, setPlayingState]);

  // Auto-play when question changes
  useEffect(() => {
    if (!hydrated || !audioUrl || muted) {
      setPlayingState(false);
      return;
    }
    void playAudio();

    const onGesture = () => {
      void playAudio();
    };
    window.addEventListener('pointerdown', onGesture, { passive: true });
    window.addEventListener('keydown', onGesture);
    return () => {
      window.removeEventListener('pointerdown', onGesture);
      window.removeEventListener('keydown', onGesture);
    };
  }, [playbackKey, replayTick, audioUrl, hydrated, muted, playAudio, setPlayingState]);

  useEffect(() => {
    return () => setPlayingState(false);
  }, [setPlayingState]);

  const toggleMute = () => {
    setMuted((m) => {
      const next = !m;
      try {
        localStorage.setItem(QUESTION_TTS_MUTE_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      if (next) {
        audioRef.current?.pause();
        setPlayingState(false);
      } else {
        void playAudio();
      }
      return next;
    });
  };

  const replay = () => {
    setReplayTick((t) => t + 1);
  };

  if (!audioUrl) return null;

  return (
    <div className={className}>
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio
        ref={audioRef}
        src={audioUrl}
        preload="auto"
        playsInline
        onEnded={() => setPlayingState(false)}
        onPause={() => setPlayingState(false)}
        onPlay={() => setPlayingState(true)}
      />

      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={toggleMute}
          aria-pressed={muted}
          className="inline-flex items-center gap-1.5 rounded-xl border border-white/50 bg-white/70 px-3 py-2 text-xs font-bold text-emerald-900 shadow-sm backdrop-blur-sm transition hover:bg-white/90"
        >
          {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          {muted ? 'הפעל הקראה' : 'השתק הקראה'}
          {needsGesture && !muted && (
            <span className="h-2 w-2 animate-ping rounded-full bg-amber-400" aria-hidden />
          )}
        </button>

        <button
          type="button"
          onClick={replay}
          disabled={muted}
          className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200/80 bg-emerald-50/80 px-3 py-2 text-xs font-bold text-emerald-800 shadow-sm transition hover:bg-emerald-100/90 disabled:opacity-50"
        >
          <RotateCcw className="h-4 w-4" />
          השמע שוב
        </button>

        {playing && !muted && (
          <span className="text-[11px] font-semibold text-emerald-700 animate-pulse">מקריא…</span>
        )}
      </div>
    </div>
  );
}
