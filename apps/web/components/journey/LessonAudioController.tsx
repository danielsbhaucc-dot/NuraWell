'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Music2, Volume2, VolumeX, ExternalLink, ChevronLeft, X } from 'lucide-react';
import type { LessonAudioTrack } from '../../lib/types/audio';

interface LessonAudioControllerProps {
  tracks: LessonAudioTrack[];
  /** האם וידאו מתנגן כרגע — אם כן, מנמיכים את עוצמת המוזיקה (duck). */
  videoActive: boolean;
  /** האם הקראת שאלה פעילה — מנמיך מוזיקת רקע (duck) כמו בווידאו. */
  ttsActive?: boolean;
  /** מפתח השלב הנוכחי — שינוי שלו מפעיל צליל מעבר. */
  sectionKey: string;
  /** התחתית של ההדר הירוק (px בחלון) — כדי למקם את הבקרה בדיוק מתחתיו. */
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
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.24);
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
    // אם ה-context עדיין במצב suspended (טרם מחוות משתמש) — מחדשים ואז מתזמנים,
    // אחרת הצלילים מתוזמנים על זמן "קפוא" ולא נשמעים.
    if (ctx.state === 'suspended') {
      void ctx.resume().then(() => scheduleCue(ctx)).catch(() => {});
    } else {
      scheduleCue(ctx);
    }
  } catch {
    /* ignore — צליל מעבר הוא תוספת, לא קריטי */
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
  // המיקום ננעל לתחתית ההדר כשהוא במלוא גובהו, ולא "עולה" בגלילה.
  const [stableTopPx, setStableTopPx] = useState<number | null>(null);

  useEffect(() => {
    if (anchorTopPx == null) return;
    setStableTopPx((prev) => (prev == null ? anchorTopPx : Math.max(prev, anchorTopPx)));
  }, [anchorTopPx]);

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
      // מחדשים את ה-context של צליל המעבר כבר עכשיו, כדי שיהיה "רץ" למעבר הבא
      ensureCueCtx(cueCtxRef);
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
    const shouldDuck = videoActive || ttsActive;
    const target = muted ? 0 : shouldDuck ? DUCK_VOLUME : BASE_VOLUME;
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
  }, [muted, videoActive, ttsActive, hasTracks]);

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

  // Prefetch של הרצועה הבאה — מחמם את קאש ה-CDN/דפדפן כדי שמעברים יהיו מיידיים.
  useEffect(() => {
    if (playable.length <= 1) return;
    const nextUrl = playable[(index + 1) % playable.length]?.url;
    if (!nextUrl) return;
    const id = window.setTimeout(() => {
      // low-priority — לא חוסם את הניגון הנוכחי
      void fetch(nextUrl, { mode: 'cors', cache: 'force-cache' }).catch(() => {});
    }, 1500);
    return () => window.clearTimeout(id);
  }, [index, playable]);

  // עצירת המוזיקה כשהאפליקציה נסגרת / עוברת לרקע; חידוש כשחוזרים (אם לא מושתק)
  useEffect(() => {
    if (!hasTracks) return;
    const pauseAll = () => {
      audioRef.current?.pause();
    };
    const onVisibility = () => {
      if (document.hidden) {
        pauseAll();
      } else if (!muted) {
        attemptPlay();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', pauseAll);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', pauseAll);
    };
  }, [hasTracks, muted, attemptPlay]);

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
        className="fixed right-2 z-40 flex flex-col items-end gap-2"
        style={{
          top:
            stableTopPx != null
              ? `${Math.max(8, stableTopPx + 8)}px`
              : 'calc(env(safe-area-inset-top, 0px) + 4.25rem)',
        }}
        aria-label="בקרת מוזיקת רקע"
      >
        {/* פאנל מורחב — מופיע רק בלחיצה, אחרת לא תופס מקום */}
        {expanded && (
          <div className="w-[min(18rem,calc(100vw-1rem))] overflow-hidden rounded-2xl border border-white/50 bg-gradient-to-br from-white/60 to-white/25 p-3 shadow-[0_12px_40px_rgba(6,78,59,0.3)] backdrop-blur-2xl">
            <div className="mb-2 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wide text-emerald-800">
                <Music2 className={`h-3.5 w-3.5 ${muted ? '' : 'animate-pulse'}`} />
                מוזיקת רקע
              </span>
              <button
                type="button"
                onClick={() => setExpanded(false)}
                aria-label="סגור"
                className="inline-flex h-6 w-6 items-center justify-center rounded-lg border border-white/60 bg-white/50 text-emerald-900 hover:bg-white/70"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <p className="truncate text-sm font-bold text-emerald-950">{creditTrackTitle}</p>
            {creditAuthor && (
              <p className="mt-0.5 text-xs text-emerald-900/90">
                מאת <span className="font-semibold">{creditAuthor}</span>
                {creditSource ? <span className="text-emerald-800/70"> · {creditSource}</span> : null}
              </p>
            )}

            <div className="mt-2.5 flex items-center gap-2">
              <button
                type="button"
                onClick={toggleMute}
                aria-pressed={muted}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/60 bg-white/50 px-3 py-2 text-xs font-bold text-emerald-900 transition-colors hover:bg-white/70"
              >
                {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                {muted ? 'הפעל' : 'השתק'}
              </button>
              {creditLink && (
                <a
                  href={creditLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-xl border border-emerald-300/60 bg-emerald-50/70 px-3 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-100/80"
                >
                  קרדיט
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </div>
        )}

        {/* כפתור צף קומפקטי — השתקה בלחיצה, הרחבה בלחיצה על הלשונית */}
        {!expanded && (
          <div className="flex items-center overflow-hidden rounded-full border border-white/45 bg-white/25 shadow-[0_6px_20px_rgba(6,78,59,0.22)] backdrop-blur-2xl">
            <button
              type="button"
              onClick={() => setExpanded(true)}
              aria-label="פתח בקרת מוזיקת רקע"
              className="flex h-8 items-center pe-0.5 ps-1.5 text-emerald-800/80 transition-colors hover:text-emerald-900"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={toggleMute}
              aria-pressed={muted}
              aria-label={muted ? 'הפעל מוזיקת רקע' : 'השתק מוזיקת רקע'}
              className="relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-emerald-900 transition-colors hover:bg-white/30"
            >
              {muted ? <VolumeX className="h-[18px] w-[18px]" /> : <Volume2 className="h-[18px] w-[18px]" />}
              {needsGesture && !muted && (
                <span className="absolute right-0.5 top-0.5 h-2 w-2 animate-ping rounded-full bg-amber-400" />
              )}
              {!muted && (
                <span className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-emerald-400/30" />
              )}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
