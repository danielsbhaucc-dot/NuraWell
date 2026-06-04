'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Pause, Play } from 'lucide-react';

interface GlassAudioPlayerProps {
  src: string;
  /** כותרת קצרה שתוצג ליד הוויזואלייזר (אופציונלי) */
  title?: string;
}

function fmt(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** נגן אודיו קומפקטי בעיצוב זכוכית — נגן/השהה, פס התקדמות נגרר, וויזואלייזר עדין. */
export function GlassAudioPlayer({ src, title }: GlassAudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);

  const toggle = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) {
      setLoading(true);
      void a
        .play()
        .then(() => setLoading(false))
        .catch(() => setLoading(false));
    } else {
      a.pause();
    }
  }, []);

  const onSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const a = audioRef.current;
    if (!a) return;
    const v = Number(e.target.value);
    a.currentTime = v;
    setCurrent(v);
  }, []);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onTime = () => setCurrent(a.currentTime);
    const onMeta = () => setDuration(a.duration || 0);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnd = () => {
      setPlaying(false);
      setCurrent(0);
    };
    a.addEventListener('timeupdate', onTime);
    a.addEventListener('loadedmetadata', onMeta);
    a.addEventListener('durationchange', onMeta);
    a.addEventListener('play', onPlay);
    a.addEventListener('pause', onPause);
    a.addEventListener('ended', onEnd);
    return () => {
      a.removeEventListener('timeupdate', onTime);
      a.removeEventListener('loadedmetadata', onMeta);
      a.removeEventListener('durationchange', onMeta);
      a.removeEventListener('play', onPlay);
      a.removeEventListener('pause', onPause);
      a.removeEventListener('ended', onEnd);
    };
  }, []);

  const pct = duration > 0 ? (current / duration) * 100 : 0;

  return (
    <div
      dir="ltr"
      className="group relative mt-2 flex items-center gap-3 overflow-hidden rounded-2xl border border-white/30 bg-white/10 px-3 py-2.5 shadow-[0_10px_30px_-6px_rgba(6,78,59,0.35)] ring-1 ring-inset ring-white/25 backdrop-blur-2xl backdrop-saturate-150"
    >
      {/* גוון זכוכית צבעוני שמבליט את האפקט על רקע בהיר */}
      <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-br from-emerald-300/30 via-teal-200/15 to-sky-300/25" />
      {/* נצנוץ רך בפינה — מראה של זכוכית אמיתית */}
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(80%_140%_at_0%_-10%,rgba(255,255,255,0.55),transparent_45%)]" />
      {/* קו הדגשה עליון (גימור זכוכית) */}
      <div className="pointer-events-none absolute inset-x-2 top-0 -z-10 h-px bg-gradient-to-r from-transparent via-white/90 to-transparent" />

      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio ref={audioRef} src={src} preload="none" />

      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? 'השהה' : 'נגן'}
        className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/30 ring-1 ring-white/40 transition-transform active:scale-95"
      >
        {playing && (
          <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/40" />
        )}
        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : playing ? (
          <Pause className="h-5 w-5" fill="currentColor" />
        ) : (
          <Play className="h-5 w-5 translate-x-px" fill="currentColor" />
        )}
      </button>

      {/* וויזואלייזר עדין — מופיע רק בזמן ניגון כדי לשמור על מראה נקי */}
      {playing && (
        <div className="flex h-6 shrink-0 items-center gap-0.5" aria-hidden>
          {[0, 1, 2, 3, 4].map((i) => (
            <span
              key={i}
              className="nura-eq-bar"
              style={{ animation: `nura-eq 0.9s ease-in-out ${i * 0.12}s infinite` }}
            />
          ))}
        </div>
      )}

      <div className="min-w-0 flex-1">
        {title && (
          <div dir="rtl" className="mb-1 truncate text-[11px] font-semibold text-slate-700">
            {title}
          </div>
        )}
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={current}
          onChange={onSeek}
          aria-label="מיקום בניגון"
          className="nura-range h-2 w-full cursor-pointer appearance-none rounded-full"
          style={{
            background: `linear-gradient(to right, rgb(16 185 129), rgb(45 212 191) ${pct}%, rgba(15,23,42,0.1) ${pct}%)`,
          }}
        />
        <div className="mt-1 flex justify-between text-[10px] font-semibold tabular-nums text-slate-500">
          <span>{fmt(current)}</span>
          <span>{fmt(duration)}</span>
        </div>
      </div>
    </div>
  );
}
