'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Music2, Volume2, VolumeX, ExternalLink, ChevronLeft, X } from 'lucide-react';
import type { LessonAudioTrack } from '../../lib/types/audio';

interface LessonAudioControllerProps {
  tracks: LessonAudioTrack[];
  /** האם וידאו מתנגן כרגע — אם כן, משתיקים את מוזיקת הרקע לחלוטין */
  videoActive: boolean;
  /** האם הקראת שאלה פעילה — מנמיך מוזיקת רקע (duck) כמו בווידאו */
  ttsActive?: boolean;
  /** מפתח השלב הנוכחי — שינוי שלו מפעיל צליל מעבר */
  sectionKey: string;
  /** התחתית של ההדר הירוק (px בחלון) — כדי למקום את הבקרה בדיוק מתחתיו */
  anchorTopPx?: number | null;
}

const MUTE_STORAGE_KEY = 'nura-lesson-audio-muted';
const BASE_VOLUME = 0.42;
const DUCK_VOLUME = 0.08;

/** יוצר (פעם אחת) את ה-AudioContext לצליל המעבר ומנסה לחדש אותו (resume). */
function ensureCueCtx(ctxRef: { current: AudioContext | null }): AudioContext | null {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    if (!ctxRef.current) ctxRef.current = new Ctx();
    const ctx = ctxRef.current;
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** מנגן את הצלילים בפועל על context שכבר רץ. */
function scheduleCue(ctx: AudioContext) {
  const now = ctx.currentTime;
  [660, 880].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const start = now + i * 0.085;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.16, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.26);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 0.26);
  });
}

/** צליל מעבר עדין (chime) שנוצר סינתטית — אפס אחסון. */
function playTransitionCue(ctxRef: { current: AudioContext | null }) {
  try {
    const ctx = ensureCueCtx(ctxRef);
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      void ctx.resume().then(() => scheduleCue(ctx)).catch(() => {});
    } else {
      scheduleCue(ctx);
    }
  } catch {
    /* ignore */
  }
}

export function LessonAudioController({ tracks, videoActive, ttsActive = false, sectionKey, anchorTopPx }: LessonAudioControllerProps) {
  const playable = tracks.filter((t) => !!t.url);
  const hasTracks = playable.length > 0;

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const cueCtxRef = useRef<AudioContext | null>(null);
  const rampRef = useRef<number | null>(null);
  const prevSectionRef = useRef<string>(sectionKey);

  const [index, setIndex] = useState(0);
  const [muted, setMuted] = useState(false);
  const [needsGesture, setNeedsGesture] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [stableTopPx, setStableTopPx] = useState<number | null>(null);

  useEffect(() => {
    if (anchorTopPx == null) return;
    setStableTopPx((prev) => (prev == null ? anchorTopPx : Math.max(prev, anchorTopPx)));
  }, [anchorTopPx]);

  useEffect(() => {
    try {
      setMuted(localStorage.getItem(MUTE_STORAGE_KEY) === '1');
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  const persistMuted = useCallback((value: boolean) => {
    try {
      localStorage.setItem(MUTE_STORAGE_KEY, value ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, []);

  const setAudioRef = useCallback((el: HTMLAudioElement | null) => {
    audioRef.current = el;
    if (el) el.volume = BASE_VOLUME;
  }, []);

  const attemptPlay = useCallback(() => {
    const a = audioRef.current;
    if (!a || videoActive) return;
    const p = a.play();
    if (p && typeof p.then === 'function') {
      p.then(() => setNeedsGesture(false)).catch(() => setNeedsGesture(true));
    }
  }, [videoActive]);

  useEffect(() => {
    if (!hasTracks || !hydrated) return;
    attemptPlay();

    const onGesture = () => {
      attemptPlay();
      ensureCueCtx(cueCtxRef);
    };
    window.addEventListener('pointerdown', onGesture, { passive: true });
    window.addEventListener('keydown', onGesture);
    return () => {
      window.removeEventListener('pointerdown', onGesture);
      window.removeEventListener('keydown', onGesture);
    };
  }, [hasTracks, hydrated, attemptPlay, index]);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    a.load();
    attemptPlay();
  }, [index, attemptPlay]);

  // וידאו פעיל → השתקה מלאה; TTS → duck; אחרת עוצמה רגילה
  useEffect(() => {
    if (!hasTracks) return;
    const a = audioRef.current;
    if (!a) return;

    if (videoActive) {
      a.pause();
      a.volume = 0;
      a.muted = true;
      return;
    }

    const shouldDuck = ttsActive;
    const target = muted ? 0 : shouldDuck ? DUCK_VOLUME : BASE_VOLUME;
    if (!muted) void a.play().catch(() => {});

    if (rampRef.current) cancelAnimationFrame(rampRef.current);
    const tick = () => {
      const el = audioRef.current;
      if (!el) return;
      const diff = target - el.volume;
      if (Math.abs(diff) < 0.008) {
        el.volume = target;
        el.muted = muted;
        return;
      }
      el.volume = Math.max(0, Math.min(1, el.volume + diff * 0.18));
      rampRef.current = requestAnimationFrame(tick);
    };
    rampRef.current = requestAnimationFrame(tick);
    return () => {
      if (rampRef.current) cancelAnimationFrame(rampRef.current);
    };
  }, [muted, videoActive, ttsActive, hasTracks]);

  useEffect(() => {
    if (!hydrated) return;
    if (prevSectionRef.current !== sectionKey) {
      prevSectionRef.current = sectionKey;
      if (!muted && !videoActive) playTransitionCue(cueCtxRef);
    }
  }, [sectionKey, muted, hydrated, videoActive]);

  useEffect(() => {
    const ctx = cueCtxRef.current;
    return () => {
      ctx?.close().catch(() => {});
    };
  }, []);

  useEffect(() => {
    if (playable.length <= 1) return;
    const nextUrl = playable[(index + 1) % playable.length]?.url;
    if (!nextUrl) return;
    const id = window.setTimeout(() => {
      void fetch(nextUrl, { mode: 'cors', cache: 'force-cache' }).catch(() => {});
    }, 1500);
    return () => window.clearTimeout(id);
  }, [index, playable]);

  useEffect(() => {
    if (!hasTracks) return;
    const pauseAll = () => {
      audioRef.current?.pause();
    };
    const onVisibility = () => {
      if (document.hidden) {
        pauseAll();
      } else if (!muted && !videoActive) {
        attemptPlay();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', pauseAll);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', pauseAll);
    };
  }, [hasTracks, muted, videoActive, attemptPlay]);

  const handleEnded = useCallback(() => {
    if (playable.length <= 1) {
      const a = audioRef.current;
      if (a && !videoActive) {
        a.currentTime = 0;
        void a.play().catch(() => {});
      }
      return;
    }
    setIndex((i) => (i + 1) % playable.length);
  }, [playable.length, videoActive]);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      persistMuted(next);
      if (!next && !videoActive) attemptPlay();
      return next;
    });
  }, [persistMuted, attemptPlay, videoActive]);

  if (!hasTracks) return null;

  const current = playable[Math.min(index, playable.length - 1)];
  const creditAuthor = current.credit?.author?.trim();
  const creditSource = current.credit?.source?.trim();
  const creditLink = current.credit?.link?.trim();
  const creditTrackTitle = current.credit?.title?.trim() || current.title;

  return (
    <>
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio
        ref={setAudioRef}
        src={current.url ?? undefined}
        loop={playable.length === 1}
        preload="auto"
        onEnded={handleEnded}
        playsInline
      />

      <div
        dir="rtl"
        className="fixed right-3 z-40 flex flex-col items-end gap-2"
        style={{
          top:
            stableTopPx != null
              ? `${Math.max(8, stableTopPx + 8)}px`
              : 'calc(env(safe-area-inset-top, 0px) + 4.25rem)',
        }}
        aria-label="בקרת מוזיקת רקע"
      >
        {expanded && (
          <div
            className="w-[min(19rem,calc(100vw-1.25rem))] overflow-hidden rounded-[22px] p-4"
            style={{
              background: 'rgba(248,250,252,0.72)',
              backdropFilter: 'blur(40px) saturate(180%)',
              WebkitBackdropFilter: 'blur(40px) saturate(180%)',
              border: '0.5px solid rgba(255,255,255,0.65)',
              boxShadow: '0 20px 50px rgba(6,78,59,0.22), inset 0 1px 0 rgba(255,255,255,0.85)',
            }}
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="flex items-center gap-2 text-[12px] font-bold text-emerald-900">
                <span
                  className="flex h-7 w-7 items-center justify-center rounded-[10px]"
                  style={{ background: 'rgba(16,185,129,0.14)', border: '0.5px solid rgba(16,185,129,0.25)' }}
                >
                  <Music2 className={`h-3.5 w-3.5 text-emerald-700 ${muted ? '' : 'animate-pulse'}`} />
                </span>
                מוזיקת רקע
              </span>
              <button
                type="button"
                onClick={() => setExpanded(false)}
                aria-label="סגור"
                className="inline-flex h-7 w-7 items-center justify-center rounded-full text-emerald-800/70 transition active:scale-95"
                style={{ background: 'rgba(0,0,0,0.06)' }}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="truncate text-[15px] font-bold text-slate-800">{creditTrackTitle}</p>
            {creditAuthor && (
              <p className="mt-1 text-[12px] font-medium text-slate-600">
                מאת <span className="font-bold text-emerald-900">{creditAuthor}</span>
                {creditSource ? <span className="text-slate-500"> · {creditSource}</span> : null}
              </p>
            )}

            <div className="mt-3.5 flex items-center gap-2">
              <button
                type="button"
                onClick={toggleMute}
                aria-pressed={muted}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-[14px] px-3 py-2.5 text-[13px] font-bold text-emerald-950 transition active:scale-[0.98]"
                style={{
                  background: 'rgba(255,255,255,0.82)',
                  border: '0.5px solid rgba(16,185,129,0.22)',
                  boxShadow: '0 2px 8px rgba(6,78,59,0.08), inset 0 1px 0 rgba(255,255,255,0.9)',
                }}
              >
                {muted ? <VolumeX className="h-[18px] w-[18px] text-emerald-800" /> : <Volume2 className="h-[18px] w-[18px] text-emerald-800" />}
                {muted ? 'הפעל שוב' : 'השתק'}
              </button>
              {creditLink && (
                <a
                  href={creditLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-[14px] px-3 py-2.5 text-[12px] font-bold text-emerald-900 transition active:scale-[0.98]"
                  style={{
                    background: 'rgba(209,250,229,0.75)',
                    border: '0.5px solid rgba(16,185,129,0.28)',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.7)',
                  }}
                >
                  זכויות יוצרים
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </div>
        )}

        {!expanded && (
          <div
            className="flex items-center overflow-hidden rounded-full"
            style={{
              background: 'rgba(248,250,252,0.55)',
              backdropFilter: 'blur(24px) saturate(160%)',
              WebkitBackdropFilter: 'blur(24px) saturate(160%)',
              border: '0.5px solid rgba(255,255,255,0.72)',
              boxShadow: '0 8px 28px rgba(6,78,59,0.18), inset 0 1px 0 rgba(255,255,255,0.75)',
            }}
          >
            <button
              type="button"
              onClick={() => setExpanded(true)}
              aria-label="פתח בקרת מוזיקת רקע"
              className="flex h-10 items-center pe-1 ps-2 text-emerald-800/75 transition active:opacity-80"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={toggleMute}
              aria-pressed={muted}
              aria-label={muted ? 'הפעל מוזיקת רקע' : 'השתק מוזיקת רקע'}
              className="relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition active:scale-95"
              style={{
                background: muted
                  ? 'linear-gradient(145deg, rgba(254,226,226,0.9), rgba(255,255,255,0.7))'
                  : 'linear-gradient(145deg, rgba(209,250,229,0.95), rgba(255,255,255,0.75))',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.9), 0 2px 10px rgba(6,78,59,0.12)',
              }}
            >
              {muted ? (
                <VolumeX className="h-5 w-5 text-rose-700" strokeWidth={2.25} />
              ) : (
                <Volume2 className="h-5 w-5 text-emerald-800" strokeWidth={2.25} />
              )}
              {needsGesture && !muted && (
                <span className="absolute right-1 top-1 h-2.5 w-2.5 animate-ping rounded-full bg-amber-400" />
              )}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
