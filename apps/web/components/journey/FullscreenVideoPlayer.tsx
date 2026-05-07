'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Play, Pause } from 'lucide-react';
import { HlsVideoGate } from './HlsVideoGate';

interface FullscreenVideoPlayerProps {
  /** bunnyEmbedId = "{libraryId}/{videoId}" — used for iframe fallback when no Pull Zone HLS */
  bunnyEmbedId: string;
  /**
   * When set (e.g. playlist.m3u8 on Pull Zone), immersive uses native/Hls.js playback like the inline player.
   * Avoids Bunny iframe embed restrictions on some production hosts (e.g. Vercel) while HLS still works.
   */
  pullZoneHlsSrc?: string | null;
  title: string;
  onEnded: () => void;
  onExit: () => void;
  /** Future checkpoints: called on every timeupdate */
  onTimeUpdate?: (seconds: number, duration: number) => void;
  /**
   * When set (e.g. bottom of StepLesson header in viewport px), video fills from there to above bottom nav.
   * When omitted, falls back to dashboard header (~4rem) only.
   */
  viewportInsetTopPx?: number;
}

function bunnyIframeUrl(embedId: string): string {
  return `https://iframe.mediadelivery.net/embed/${embedId}?autoplay=true&preload=true&responsive=true&playsinline=true&muted=false&controls=false`;
}

export function FullscreenVideoPlayer({
  bunnyEmbedId,
  pullZoneHlsSrc,
  title,
  onEnded,
  onExit,
  onTimeUpdate,
  viewportInsetTopPx,
}: FullscreenVideoPlayerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const hlsVideoRef = useRef<HTMLVideoElement | null>(null);
  const [hlsListenKey, setHlsListenKey] = useState(0);
  const useHlsImmersive = Boolean(pullZoneHlsSrc?.trim());

  const [isPlaying, setIsPlaying] = useState(true);
  const [showIcon, setShowIcon] = useState(false);
  const [exitConfirmOpen, setExitConfirmOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const iconTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onEndedRef = useRef(onEnded);
  const onTimeUpdateRef = useRef(onTimeUpdate);
  const mountedRef = useRef(true);
  onEndedRef.current = onEnded;
  onTimeUpdateRef.current = onTimeUpdate;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    console.warn('[NuraWell][FullscreenVideoPlayer] mounted', {
      bunnyEmbedId,
      title,
      immersiveMode: useHlsImmersive ? 'hls' : 'iframe',
    });
    // #region agent log
    fetch('http://127.0.0.1:7304/ingest/e0c3e9ba-ee31-4fb3-b095-72fbc06088f4', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '6fc6a6' },
      body: JSON.stringify({
        sessionId: '6fc6a6',
        runId: 'pre-fix',
        hypothesisId: 'H3',
        location: 'FullscreenVideoPlayer.tsx:mount',
        message: 'FullscreenVideoPlayer mounted',
        data: {
          bunnyEmbedId,
          titleLen: title?.length ?? 0,
          immersiveMode: useHlsImmersive ? 'hls' : 'iframe',
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
  }, [bunnyEmbedId, title, useHlsImmersive]);

  useEffect(() => {
    if (typeof document === 'undefined' || !mounted) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
      if (iconTimerRef.current) clearTimeout(iconTimerRef.current);
    };
  }, [mounted]);

  useEffect(() => {
    if (useHlsImmersive) return;
    const handler = (e: MessageEvent) => {
      if (!mountedRef.current) return;
      if (!e.origin.includes('mediadelivery.net')) return;
      let data: Record<string, unknown>;
      try {
        data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
      } catch {
        return;
      }

      const event = (data.event as string)?.toLowerCase();
      if (event === 'ended') {
        onEndedRef.current();
      } else if (event === 'play') {
        if (mountedRef.current) setIsPlaying(true);
      } else if (event === 'pause') {
        if (mountedRef.current) setIsPlaying(false);
      } else if (event === 'timeupdate') {
        onTimeUpdateRef.current?.(Number(data.seconds ?? 0), Number(data.duration ?? 0));
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [useHlsImmersive]);

  useEffect(() => {
    if (!useHlsImmersive) return;
    const v = hlsVideoRef.current;
    if (!v) return;
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onTimeUpdateEv = () => onTimeUpdateRef.current?.(v.currentTime, v.duration || 0);
    v.addEventListener('play', onPlay);
    v.addEventListener('pause', onPause);
    v.addEventListener('timeupdate', onTimeUpdateEv);
    setIsPlaying(!v.paused);
    return () => {
      v.removeEventListener('play', onPlay);
      v.removeEventListener('pause', onPause);
      v.removeEventListener('timeupdate', onTimeUpdateEv);
    };
  }, [useHlsImmersive, pullZoneHlsSrc, hlsListenKey]);

  const sendToPlayer = useCallback((event: string, extra?: Record<string, unknown>) => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;
    iframe.contentWindow.postMessage(
      JSON.stringify({ event, ...extra }),
      'https://iframe.mediadelivery.net'
    );
  }, []);

  const flashIcon = useCallback(() => {
    setShowIcon(true);
    if (iconTimerRef.current) clearTimeout(iconTimerRef.current);
    iconTimerRef.current = setTimeout(() => setShowIcon(false), 900);
  }, []);

  const handleTap = useCallback(() => {
    if (exitConfirmOpen) return;
    if (useHlsImmersive) {
      const v = hlsVideoRef.current;
      if (!v) return;
      if (v.paused) void v.play();
      else v.pause();
      flashIcon();
      return;
    }
    if (isPlaying) {
      sendToPlayer('pause');
      setIsPlaying(false);
    } else {
      sendToPlayer('play');
      setIsPlaying(true);
    }
    flashIcon();
  }, [useHlsImmersive, isPlaying, exitConfirmOpen, sendToPlayer, flashIcon]);

  const iframeUrl = bunnyIframeUrl(bunnyEmbedId);
  // Keep prop for backwards compatibility with callers; immersive now always covers full viewport.
  void viewportInsetTopPx;

  if (!mounted || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[300] bg-black flex flex-col"
    >
      <button
        type="button"
        aria-label="סגור"
        onClick={() => setExitConfirmOpen(true)}
        className="absolute top-4 left-4 z-[310] w-11 h-11 rounded-full flex items-center justify-center"
        style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)' }}
      >
        <X className="w-5 h-5 text-white" />
      </button>

      {useHlsImmersive ? (
        <HlsVideoGate
          ref={hlsVideoRef}
          src={pullZoneHlsSrc!.trim()}
          autoPlay
          playsInline
          controls={false}
          videoClassName="absolute inset-0 h-full w-full object-cover"
          className="absolute inset-0 w-full h-full border-0"
          onLoaded={() => setHlsListenKey(k => k + 1)}
          onEnded={() => onEndedRef.current()}
        />
      ) : (
        <iframe
          ref={iframeRef}
          src={iframeUrl}
          title={title}
          referrerPolicy="strict-origin-when-cross-origin"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen
          className="absolute inset-0 w-full h-full border-0"
          style={{ objectFit: 'cover' }}
        />
      )}

      <div
        className="absolute inset-0 z-[305] cursor-pointer"
        onClick={handleTap}
        aria-label={isPlaying ? 'השהה' : 'הפעל'}
        role="button"
        tabIndex={0}
        onKeyDown={e => {
          if (e.key === ' ' || e.key === 'Enter') handleTap();
        }}
      />

      {showIcon && (
        <div className="absolute inset-0 z-[306] flex items-center justify-center pointer-events-none animate-pulse">
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center transition-opacity duration-300"
            style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
          >
            {isPlaying ? (
              <Play className="w-9 h-9 text-white ml-1" fill="white" />
            ) : (
              <Pause className="w-9 h-9 text-white" fill="white" />
            )}
          </div>
        </div>
      )}

      {exitConfirmOpen && (
        <div
          className="absolute inset-0 z-[320] flex items-center justify-center p-6 transition-all duration-200"
          style={{ background: 'rgba(0,0,0,0.6)' }}
        >
          <div
            className="w-full max-w-sm rounded-3xl p-6 text-center transition-all duration-200"
            style={{
              background: 'linear-gradient(165deg, #ffffff 0%, #ecfdf5 100%)',
              border: '1px solid rgba(16,185,129,0.25)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <p className="text-lg font-black mb-2" style={{ color: '#1A1730' }}>לצאת מהסרטון?</p>
            <p className="text-sm text-gray-600 mb-6 leading-relaxed">
              תחזרו למסך &ldquo;המסע שלי&rdquo;. אפשר תמיד להיכנס שוב לצעד ולהמשיך מהמקום שבו עצרתם.
            </p>
            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                onClick={onExit}
                className="w-full py-3.5 rounded-2xl font-bold text-white"
                style={{ background: 'linear-gradient(135deg, #047857, #10b981)' }}
              >
                כן, חזרה למסע
              </button>
              <button
                type="button"
                onClick={() => setExitConfirmOpen(false)}
                className="w-full py-3.5 rounded-2xl font-bold text-gray-600"
                style={{ background: 'rgba(0,0,0,0.05)', border: '1px solid rgba(0,0,0,0.08)' }}
              >
                להמשיך לצפות
              </button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}
