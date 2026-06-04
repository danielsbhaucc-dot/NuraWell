'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Music2, Volume2, VolumeX, ExternalLink } from 'lucide-react';
import type { LessonAudioTrack } from '../../lib/types/audio';

interface LessonAudioControllerProps {
  tracks: LessonAudioTrack[];
  /** האם וידאו מתנגן כרגע — אם כן, מנמיכים את עוצמת המוזיקה (duck). */
  videoActive: boolean;
  /** מפתח השלב הנוכחי — שינוי שלו מפעיל צליל מעבר. */
  sectionKey: string;
}

const MUTE_STORAGE_KEY = 'nura-lesson-audio-muted';
const BASE_VOLUME = 0.42;
const DUCK_VOLUME = 0.08;

/** צליל מעבר עדין (chime) שנוצר סינתטית — אפס אחסון. */
function playTransitionCue(ctxRef: { current: AudioContext | null }) {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    if (!ctxRef.current) ctxRef.current = new Ctx();
    const ctx = ctxRef.current;
    if (ctx.state === 'suspended') void ctx.resume();
    const now = ctx.currentTime;
    [660, 880].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const start = now + i * 0.085;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.16, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.24);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.26);
    });
  } catch {
    /* ignore — צליל מעבר הוא תוספת, לא קריטי */
  }
}

export function LessonAudioController({ tracks, videoActive, sectionKey }: LessonAudioControllerProps) {
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

  // העדפת השתקה נשמרת מקומית
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

  // ref עם אתחול עוצמה נמוכה כדי שלא יהיה "פיצוץ" קול ברגע הראשון
  const setAudioRef = useCallback((el: HTMLAudioElement | null) => {
    audioRef.current = el;
    if (el) el.volume = BASE_VOLUME;
  }, []);

  const attemptPlay = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    const p = a.play();
    if (p && typeof p.then === 'function') {
      p.then(() => setNeedsGesture(false)).catch(() => setNeedsGesture(true));
    }
  }, []);

  // ניגון אוטומטי + שחזור אחרי מחוות משתמש ראשונה (מדיניות autoplay)
  useEffect(() => {
    if (!hasTracks || !hydrated) return;
    attemptPlay();

    const onGesture = () => {
      attemptPlay();
    };
    window.addEventListener('pointerdown', onGesture, { passive: true });
    window.addEventListener('keydown', onGesture);
    return () => {
      window.removeEventListener('pointerdown', onGesture);
      window.removeEventListener('keydown', onGesture);
    };
  }, [hasTracks, hydrated, attemptPlay, index]);

  // החלפת רצועה → טעינה וניגון
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    a.load();
    attemptPlay();
  }, [index, attemptPlay]);

  // הנמכה/השתקה חלקה של העוצמה
  useEffect(() => {
    if (!hasTracks) return;
    const target = muted ? 0 : videoActive ? DUCK_VOLUME : BASE_VOLUME;
    if (rampRef.current) cancelAnimationFrame(rampRef.current);
    const tick = () => {
      const a = audioRef.current;
      if (!a) return;
      const diff = target - a.volume;
      if (Math.abs(diff) < 0.008) {
        a.volume = target;
        a.muted = muted;
        return;
      }
      a.volume = Math.max(0, Math.min(1, a.volume + diff * 0.18));
      rampRef.current = requestAnimationFrame(tick);
    };
    rampRef.current = requestAnimationFrame(tick);
    return () => {
      if (rampRef.current) cancelAnimationFrame(rampRef.current);
    };
  }, [muted, videoActive, hasTracks]);

  // צליל מעבר בכל החלפת שלב (אלא אם מושתק)
  useEffect(() => {
    if (!hydrated) return;
    if (prevSectionRef.current !== sectionKey) {
      prevSectionRef.current = sectionKey;
      if (!muted) playTransitionCue(cueCtxRef);
    }
  }, [sectionKey, muted, hydrated]);

  useEffect(() => {
    return () => {
      cueCtxRef.current?.close().catch(() => {});
    };
  }, []);

  const handleEnded = useCallback(() => {
    if (playable.length <= 1) {
      const a = audioRef.current;
      if (a) {
        a.currentTime = 0;
        void a.play().catch(() => {});
      }
      return;
    }
    setIndex((i) => (i + 1) % playable.length);
  }, [playable.length]);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      persistMuted(next);
      if (!next) attemptPlay();
      return next;
    });
  }, [persistMuted, attemptPlay]);

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
        className="fixed right-3 z-40 flex max-w-[min(20rem,calc(100vw-1.5rem))] items-center gap-2 rounded-2xl border border-white/40 bg-white/25 px-2.5 py-2 shadow-[0_8px_30px_rgba(6,78,59,0.25)] backdrop-blur-2xl"
        style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 5.25rem)' }}
        aria-label="בקרת מוזיקת רקע"
      >
        <button
          type="button"
          onClick={toggleMute}
          aria-pressed={muted}
          aria-label={muted ? 'הפעל מוזיקת רקע' : 'השתק מוזיקת רקע'}
          className="relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/50 bg-white/40 text-emerald-900 transition-colors hover:bg-white/60"
        >
          {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
          {needsGesture && !muted && (
            <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 animate-ping rounded-full bg-amber-400" />
          )}
        </button>

        <div className="min-w-0 flex-1 leading-tight">
          <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-emerald-800/80">
            <Music2 className={`h-3 w-3 ${muted ? '' : 'animate-pulse'}`} />
            מוזיקת רקע
          </div>
          <div className="truncate text-[11px] text-emerald-950/90">
            <span className="font-semibold">{creditTrackTitle}</span>
            {creditAuthor ? (
              <>
                {' · '}
                {creditLink ? (
                  <a
                    href={creditLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-0.5 underline decoration-emerald-700/40 underline-offset-2"
                  >
                    {creditAuthor}
                    <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                ) : (
                  <span>{creditAuthor}</span>
                )}
              </>
            ) : null}
            {creditSource ? <span className="text-emerald-800/70"> · {creditSource}</span> : null}
          </div>
        </div>
      </div>
    </>
  );
}
