'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Play, Pause, Sparkles, Clock3 } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { HlsVideoGate } from './HlsVideoGate';
import type { ImmersiveAttentionStop } from '../../lib/journey/immersiveAttentionStops';
import { formatSecondsAsClock } from '../../lib/journey/immersiveAttentionStops';
import { useAlmogAvatarUrl } from '../../lib/client/useAlmogAvatarUrl';
import { ALMOG_AVATAR_FALLBACK } from '../../lib/ai/almog-avatar';

interface FullscreenVideoPlayerProps {
  /** bunnyEmbedId = "{libraryId}/{videoId}" — used for iframe fallback when no Pull Zone HLS */
  bunnyEmbedId: string;
  /**
   * When set (e.g. playlist.m3u8 on Pull Zone), immersive uses native/Hls.js playback like the inline player.
   * Avoids Bunny iframe embed restrictions on some production hosts (e.g. Vercel) while HLS still works.
   */
  pullZoneHlsSrc?: string | null;
  title: string;
  attentionStops?: ImmersiveAttentionStop[];
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
  attentionStops = [],
  onEnded,
  onExit,
  onTimeUpdate,
  viewportInsetTopPx,
}: FullscreenVideoPlayerProps) {
  const { avatarUrl: almogAvatarSrc } = useAlmogAvatarUrl();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const hlsVideoRef = useRef<HTMLVideoElement | null>(null);
  const [hlsListenKey, setHlsListenKey] = useState(0);
  const useHlsImmersive = Boolean(pullZoneHlsSrc?.trim());

  const [isPlaying, setIsPlaying] = useState(true);
  const [showIcon, setShowIcon] = useState(false);
  const [exitConfirmOpen, setExitConfirmOpen] = useState(false);
  const [activeAttentionStop, setActiveAttentionStop] = useState<ImmersiveAttentionStop | null>(null);
  const [attentionFeedbackOpen, setAttentionFeedbackOpen] = useState(false);
  const [attentionFeedbackText, setAttentionFeedbackText] = useState('');
  const [autoResumeSecondsLeft, setAutoResumeSecondsLeft] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);
  const iconTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoResumeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const answeredAttentionIdsRef = useRef<Set<string>>(new Set());
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
    if (typeof document === 'undefined' || !mounted) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
      if (iconTimerRef.current) clearTimeout(iconTimerRef.current);
      if (autoResumeIntervalRef.current) clearInterval(autoResumeIntervalRef.current);
    };
  }, [mounted]);

  useEffect(() => {
    answeredAttentionIdsRef.current.clear();
  }, [attentionStops, bunnyEmbedId]);

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
        const seconds = Number(data.seconds ?? 0);
        const duration = Number(data.duration ?? 0);
        onTimeUpdateRef.current?.(seconds, duration);
        handleAttentionCheck(seconds);
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
    const onTimeUpdateEv = () => {
      onTimeUpdateRef.current?.(v.currentTime, v.duration || 0);
      handleAttentionCheck(v.currentTime);
    };
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

  const pausePlayback = useCallback(() => {
    if (useHlsImmersive) {
      hlsVideoRef.current?.pause();
      setIsPlaying(false);
      return;
    }
    sendToPlayer('pause');
    setIsPlaying(false);
  }, [sendToPlayer, useHlsImmersive]);

  const resumePlayback = useCallback(() => {
    if (useHlsImmersive) {
      void hlsVideoRef.current?.play();
      setIsPlaying(true);
      return;
    }
    sendToPlayer('play');
    setIsPlaying(true);
  }, [sendToPlayer, useHlsImmersive]);

  const handleAttentionCheck = useCallback((seconds: number) => {
    if (!attentionStops.length || activeAttentionStop || exitConfirmOpen) return;
    const nextStop = attentionStops.find(stop => (
      !answeredAttentionIdsRef.current.has(stop.id) && seconds >= stop.time_seconds
    ));
    if (!nextStop) return;
    pausePlayback();
    setActiveAttentionStop(nextStop);
    setAttentionFeedbackOpen(false);
    setAttentionFeedbackText('');
    setAutoResumeSecondsLeft(null);
  }, [attentionStops, activeAttentionStop, exitConfirmOpen, pausePlayback]);

  const finishAttentionStop = useCallback(() => {
    if (!activeAttentionStop) return;
    answeredAttentionIdsRef.current.add(activeAttentionStop.id);
    setActiveAttentionStop(null);
    setAttentionFeedbackOpen(false);
    setAttentionFeedbackText('');
    setAutoResumeSecondsLeft(null);
    if (autoResumeIntervalRef.current) {
      clearInterval(autoResumeIntervalRef.current);
      autoResumeIntervalRef.current = null;
    }
    resumePlayback();
  }, [activeAttentionStop, resumePlayback]);

  const openAttentionFeedback = useCallback((selectedIndex: number) => {
    if (!activeAttentionStop) return;
    const hasCorrectAnswer = Number.isInteger(activeAttentionStop.correct_option_index);
    const isCorrect = hasCorrectAnswer && selectedIndex === activeAttentionStop.correct_option_index;
    const feedbackToShow = hasCorrectAnswer
      ? (isCorrect
          ? (activeAttentionStop.feedback_correct || activeAttentionStop.feedback || 'יפה!')
          : (activeAttentionStop.feedback_incorrect || activeAttentionStop.feedback || 'כמעט, ממשיכים.'))
      : (activeAttentionStop.feedback || 'מצוין, ממשיכים.');
    setAttentionFeedbackText(feedbackToShow);
    setAttentionFeedbackOpen(true);
    const total = Math.max(3, activeAttentionStop.auto_resume_seconds || 10);
    setAutoResumeSecondsLeft(total);
    if (autoResumeIntervalRef.current) clearInterval(autoResumeIntervalRef.current);
    autoResumeIntervalRef.current = setInterval(() => {
      setAutoResumeSecondsLeft(prev => {
        if (prev === null || prev <= 1) {
          if (autoResumeIntervalRef.current) {
            clearInterval(autoResumeIntervalRef.current);
            autoResumeIntervalRef.current = null;
          }
          finishAttentionStop();
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  }, [activeAttentionStop, finishAttentionStop]);

  const flashIcon = useCallback(() => {
    setShowIcon(true);
    if (iconTimerRef.current) clearTimeout(iconTimerRef.current);
    iconTimerRef.current = setTimeout(() => setShowIcon(false), 900);
  }, []);

  const handleTap = useCallback(() => {
    if (exitConfirmOpen || activeAttentionStop) return;
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
  }, [useHlsImmersive, isPlaying, exitConfirmOpen, activeAttentionStop, sendToPlayer, flashIcon]);

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
      <AnimatePresence>
        {activeAttentionStop && (
          <motion.div
            className="absolute inset-0 z-[321] flex items-center justify-center p-5"
            style={{ background: 'rgba(2,6,23,0.76)' }}
            onClick={() => setActiveAttentionStop(activeAttentionStop)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
          >
            <motion.div
              className="w-full max-w-md rounded-3xl p-5 sm:p-6"
              style={{
                background: 'linear-gradient(165deg, rgba(255,255,255,0.72) 0%, rgba(236,253,245,0.55) 100%)',
                border: '1px solid rgba(255,255,255,0.55)',
                boxShadow: '0 24px 60px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.45)',
                backdropFilter: 'blur(18px)',
              }}
              onClick={e => e.stopPropagation()}
              initial={{ opacity: 0, y: 20, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              transition={{ duration: 0.26, ease: 'easeOut' }}
            >
              <motion.div
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-4 text-xs font-bold text-emerald-700"
                style={{
                  background: 'rgba(255,255,255,0.72)',
                  border: '1px solid rgba(16,185,129,0.22)',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.3)',
                }}
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.08, duration: 0.2 }}
              >
                <Sparkles className="w-3.5 h-3.5" />
                נקודת קשב
                <span className="opacity-80">· {formatSecondsAsClock(activeAttentionStop.time_seconds)}</span>
              </motion.div>

              <motion.p
                className="text-[22px] leading-snug font-black mb-5"
                style={{ color: '#1A1730' }}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.12, duration: 0.2 }}
              >
                {activeAttentionStop.question}
              </motion.p>

              <AnimatePresence mode="wait">
                {!attentionFeedbackOpen ? (
                  <motion.div
                    key="answers"
                    className="grid grid-cols-2 gap-2.5"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.18 }}
                  >
                    {(activeAttentionStop.options?.length ? activeAttentionStop.options : ['כן', 'לא']).map((option, idx) => (
                      <motion.button
                        key={`${activeAttentionStop.id}-${idx}`}
                        type="button"
                        onClick={() => openAttentionFeedback(idx)}
                        className={`py-3 rounded-2xl font-bold ${idx === 0 ? 'text-white' : 'text-gray-700'}`}
                        style={idx === 0
                          ? {
                              background: 'linear-gradient(135deg, rgba(5,150,105,0.9), rgba(16,185,129,0.92))',
                              border: '1px solid rgba(255,255,255,0.28)',
                              boxShadow: '0 6px 16px rgba(5,150,105,0.28)',
                            }
                          : {
                              background: 'rgba(255,255,255,0.5)',
                              border: '1px solid rgba(255,255,255,0.42)',
                              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.26)',
                            }}
                        whileTap={{ scale: 0.97 }}
                      >
                        {option}
                      </motion.button>
                    ))}
                  </motion.div>
                ) : (
                  <motion.div
                    key="feedback"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div
                      className="mb-4 flex items-start gap-3 rounded-2xl p-3 sm:p-4"
                      style={{
                        background: 'rgba(255,255,255,0.38)',
                        border: '1px solid rgba(16,185,129,0.22)',
                        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.5)',
                        backdropFilter: 'blur(12px)',
                      }}
                    >
                      <img
                        src={almogAvatarSrc}
                        alt=""
                        className="h-14 w-14 shrink-0 rounded-2xl object-cover ring-2 ring-white/80 shadow-md"
                        onError={(e) => {
                          e.currentTarget.onerror = null;
                          e.currentTarget.src = ALMOG_AVATAR_FALLBACK;
                        }}
                      />
                      <div className="min-w-0 flex-1 text-right">
                        <div className="mb-2 inline-flex flex-wrap items-center gap-2">
                          <span
                            className="rounded-full px-2.5 py-1 text-[11px] font-black text-emerald-950"
                            style={{
                              background: 'linear-gradient(135deg, rgba(16,185,129,0.35), rgba(52,211,153,0.45))',
                              border: '1px solid rgba(255,255,255,0.55)',
                              boxShadow: '0 4px 12px rgba(16,185,129,0.2)',
                            }}
                          >
                            אלמוג
                          </span>
                          <span className="text-[11px] font-semibold text-emerald-900/75">משוב אישי</span>
                        </div>
                        <p className="text-[13px] leading-relaxed text-emerald-950/90">
                          רגע לפני שממשיכים — זה איך שאני רואה את זה:
                        </p>
                      </div>
                    </div>
                    <p className="text-base leading-relaxed font-semibold mb-4 text-gray-800">
                      {attentionFeedbackText}
                    </p>
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                      <motion.button
                        type="button"
                        onClick={finishAttentionStop}
                        className="w-full sm:flex-1 min-h-[50px] px-4 py-3 rounded-2xl font-black text-[15px] text-white"
                        style={{
                          background: 'linear-gradient(135deg, #059669, #10b981)',
                          border: '1px solid rgba(255,255,255,0.28)',
                          boxShadow: '0 10px 22px rgba(5,150,105,0.3), inset 0 1px 0 rgba(255,255,255,0.25)',
                        }}
                        whileTap={{ scale: 0.98 }}
                      >
                        הבנתי, ממשיכים
                      </motion.button>
                      <motion.div
                        className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold text-emerald-900 w-full sm:w-auto"
                        style={{
                          background: 'rgba(255,255,255,0.46)',
                          border: '1px solid rgba(255,255,255,0.4)',
                          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.22)',
                        }}
                        key={autoResumeSecondsLeft ?? 0}
                        initial={{ scale: 1.05, opacity: 0.8 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ duration: 0.18 }}
                      >
                        <Clock3 className="w-3.5 h-3.5" />
                        ממשיך אוטומטית בעוד {autoResumeSecondsLeft ?? 0}ש׳
                      </motion.div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>,
    document.body
  );
}
