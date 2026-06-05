'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  Save,
  Undo2,
} from 'lucide-react';
import {
  DEFAULT_LYRICS,
  splitLyricWords,
  type ComingSoonLyrics,
  type LyricLineConfig,
} from '@/lib/coming-soon/lyrics';

/** פיצוי תגובת-אדם: בני אדם מקליקים מעט באיחור → מקדימים את הזמן שנקלט */
const REACTION_COMP = 0.12;

type FlatWord = { lineIdx: number; wordIdx: number; text: string };

function buildFlat(lines: LyricLineConfig[]): FlatWord[] {
  const out: FlatWord[] = [];
  lines.forEach((line, lineIdx) => {
    splitLyricWords(line.text).forEach((text, wordIdx) => {
      out.push({ lineIdx, wordIdx, text });
    });
  });
  return out;
}

function fmt(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0.00';
  return sec.toFixed(2);
}

export function AdminComingSoonLyricsEditor({ songUrl }: { songUrl: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [lines, setLines] = useState<LyricLineConfig[]>(DEFAULT_LYRICS.lines);
  const [lyricsText, setLyricsText] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showText, setShowText] = useState(false);

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  // tap session
  const flat = useMemo(() => buildFlat(lines), [lines]);
  const [times, setTimes] = useState<number[]>([]); // per-flat-word absolute times
  const [tapPos, setTapPos] = useState(0); // index into flat of the next word to tap

  // ---- audio wiring ----
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    let last = 0;
    const onTime = () => {
      const now = performance.now();
      if (now - last > 70) {
        last = now;
        setCurrentTime(a.currentTime);
      }
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    a.addEventListener('timeupdate', onTime);
    a.addEventListener('play', onPlay);
    a.addEventListener('pause', onPause);
    a.addEventListener('ended', onPause);
    return () => {
      a.removeEventListener('timeupdate', onTime);
      a.removeEventListener('play', onPlay);
      a.removeEventListener('pause', onPause);
      a.removeEventListener('ended', onPause);
    };
  }, [songUrl]);

  // ---- load saved ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/v1/admin/coming-soon-lyrics', { credentials: 'include' });
        const data = (await res.json()) as { lyrics?: ComingSoonLyrics };
        if (!cancelled && data.lyrics?.lines?.length) {
          setLines(data.lyrics.lines);
        }
      } catch {
        /* keep defaults */
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // keep textarea in sync when lines change from load/defaults
  useEffect(() => {
    setLyricsText(lines.map((l) => l.text).join('\n'));
  }, [lines]);

  const togglePlay = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) void a.play();
    else a.pause();
  }, []);

  const restartSong = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    a.currentTime = 0;
    setCurrentTime(0);
  }, []);

  // ---- the core: tap the current word ----
  const tap = useCallback(() => {
    const a = audioRef.current;
    if (!a || tapPos >= flat.length) return;
    const t = Math.max(0, Number((a.currentTime - REACTION_COMP).toFixed(2)));
    setTimes((prev) => {
      const next = [...prev];
      next[tapPos] = t;
      return next;
    });
    setTapPos((p) => p + 1);
  }, [tapPos, flat.length]);

  const undoTap = useCallback(() => {
    setTapPos((p) => Math.max(0, p - 1));
  }, []);

  const resetTaps = useCallback(() => {
    setTimes([]);
    setTapPos(0);
  }, []);

  const startFresh = useCallback(() => {
    resetTaps();
    const a = audioRef.current;
    if (a) {
      a.currentTime = 0;
      void a.play();
    }
  }, [resetTaps]);

  // keyboard: space = tap, backspace = undo
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT')) return;
      if (e.code === 'Space') {
        e.preventDefault();
        tap();
      } else if (e.code === 'Backspace') {
        e.preventDefault();
        undoTap();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tap, undoTap]);

  // apply edited lyrics text → rebuild lines (resets timing)
  const applyLyricsText = useCallback(() => {
    const newLines: LyricLineConfig[] = lyricsText
      .split('\n')
      .map((t) => t.trim())
      .filter(Boolean)
      .map((text, i) => {
        const prev = lines[i];
        return { text, start: 0, kind: prev?.kind ?? 'normal', tag: prev?.tag };
      });
    if (newLines.length) {
      setLines(newLines);
      resetTaps();
      setSuccess(null);
      setError(null);
    }
  }, [lyricsText, lines, resetTaps]);

  const loadDefaults = useCallback(() => {
    setLines(DEFAULT_LYRICS.lines);
    resetTaps();
    setSuccess(null);
    setError(null);
  }, [resetTaps]);

  // ---- save: fold flat times back into per-line wordStarts ----
  const save = useCallback(async () => {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const payloadLines: LyricLineConfig[] = lines.map((line, lineIdx) => {
        const words = splitLyricWords(line.text);
        const wordStarts: number[] = [];
        for (let w = 0; w < words.length; w++) {
          const flatIdx = flat.findIndex((f) => f.lineIdx === lineIdx && f.wordIdx === w);
          const t = flatIdx >= 0 ? times[flatIdx] : undefined;
          if (typeof t === 'number') wordStarts.push(t);
        }
        const hasFull = wordStarts.length === words.length && words.length > 0;
        return {
          text: line.text,
          start: hasFull ? wordStarts[0] : line.start || 0,
          wordStarts: hasFull ? wordStarts : undefined,
          kind: line.kind ?? 'normal',
          tag: line.tag?.trim() || undefined,
        };
      });

      const payload: ComingSoonLyrics = { syncOffset: 0, lines: payloadLines };
      const res = await fetch('/api/v1/admin/coming-soon-lyrics', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lyrics: payload }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error || 'שמירה נכשלה');
        return;
      }
      setLines(payloadLines);
      setSuccess('התזמונים נשמרו! רענן את עמוד "בקרוב" כדי לראות.');
    } catch {
      setError('שגיאת רשת');
    } finally {
      setBusy(false);
    }
  }, [lines, flat, times]);

  const done = tapPos >= flat.length && flat.length > 0;
  const progress = flat.length ? Math.min(1, tapPos / flat.length) : 0;
  const currentWord = tapPos < flat.length ? flat[tapPos] : null;
  const nextWord = tapPos + 1 < flat.length ? flat[tapPos + 1] : null;
  const prevWord = tapPos > 0 ? flat[tapPos - 1] : null;
  const prevTime = tapPos > 0 ? times[tapPos - 1] : undefined;

  return (
    <div className="mt-5 rounded-2xl border border-emerald-300/30 bg-slate-900/95 p-4 text-white" dir="rtl">
      <audio ref={audioRef} src={songUrl} preload="metadata" />

      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600">
          <Play className="h-4 w-4 fill-white" />
        </span>
        <div>
          <h3 className="text-sm font-black">סנכרון בתיפוף — מילה אחרי מילה</h3>
          <p className="text-[11px] text-emerald-100/60">נגן את השיר והקש על כל מילה בדיוק כשהיא נשמעת.</p>
        </div>
        <div className="mr-auto rounded-lg bg-black/40 px-2.5 py-1 font-mono text-sm font-bold tabular-nums text-lime-300">
          {fmt(currentTime)}s
        </div>
      </div>

      {/* transport */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={togglePlay}
          className="flex h-10 items-center gap-2 rounded-xl bg-emerald-500 px-4 text-sm font-bold text-[#04231a] transition hover:bg-emerald-400"
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 fill-[#04231a]" />}
          {playing ? 'השהה' : 'נגן'}
        </button>
        <button
          type="button"
          onClick={startFresh}
          className="flex h-10 items-center gap-1.5 rounded-xl bg-gradient-to-l from-lime-400 to-emerald-400 px-4 text-sm font-black text-[#04231a] transition hover:brightness-105"
        >
          <RotateCcw className="h-4 w-4" />
          התחל סנכרון מ-0
        </button>
        <button
          type="button"
          onClick={restartSong}
          className="h-10 rounded-xl border border-white/15 bg-white/5 px-3 text-sm font-semibold text-white/80 transition hover:bg-white/10"
        >
          להתחלת השיר
        </button>
      </div>

      {/* progress */}
      <div className="mt-3">
        <div className="flex items-center justify-between text-[11px] font-semibold text-emerald-100/70">
          <span>
            {tapPos}/{flat.length} מילים סומנו
          </span>
          {done && <span className="text-lime-300">הושלם — אפשר לשמור ✓</span>}
        </div>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-l from-emerald-400 to-lime-300 transition-[width] duration-150"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      </div>

      {/* big tap stage */}
      <div className="mt-4 rounded-2xl border border-white/10 bg-black/40 p-5 text-center">
        {prevWord && (
          <p className="text-sm text-white/40">
            קודם: «{prevWord.text}»{' '}
            {typeof prevTime === 'number' && <span className="font-mono text-emerald-300/70">@{fmt(prevTime)}s</span>}
          </p>
        )}

        {currentWord ? (
          <>
            <p className="mt-1 text-xs font-bold tracking-widest text-emerald-100/50">המילה הבאה</p>
            <p className="mt-1 text-4xl font-black text-white sm:text-5xl">{currentWord.text}</p>
            {nextWord && <p className="mt-2 text-base text-white/35">אחר כך: {nextWord.text}</p>}
          </>
        ) : (
          <p className="py-4 text-2xl font-black text-lime-300">סיימת לסמן את כל המילים! 🎉</p>
        )}
      </div>

      {/* the one big button */}
      <button
        type="button"
        onClick={tap}
        disabled={done}
        className="mt-3 w-full rounded-2xl bg-gradient-to-l from-lime-400 to-emerald-400 px-4 py-6 text-center text-xl font-black text-[#04231a] shadow-lg transition active:scale-[0.99] disabled:opacity-40"
      >
        סמן מילה ▸
        <span className="mt-1 block text-xs font-semibold opacity-70">(או הקש על מקש הרווח)</span>
      </button>

      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={undoTap}
          disabled={tapPos === 0}
          className="flex h-9 items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3 text-xs font-semibold text-white/80 transition hover:bg-white/10 disabled:opacity-40"
        >
          <Undo2 className="h-4 w-4" />
          אחורה (Backspace)
        </button>
        <button
          type="button"
          onClick={resetTaps}
          className="h-9 rounded-xl border border-white/15 bg-white/5 px-3 text-xs font-semibold text-white/80 transition hover:bg-white/10"
        >
          אפס סימונים
        </button>
        <button
          type="button"
          disabled={busy || !loaded}
          onClick={() => void save()}
          className="mr-auto flex h-10 items-center gap-2 rounded-xl bg-gradient-to-l from-emerald-600 to-teal-600 px-5 text-sm font-bold text-white shadow-lg transition hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          שמור תזמונים
        </button>
      </div>

      {/* advanced: edit lyrics text + kinds */}
      <button
        type="button"
        onClick={() => setShowText((s) => !s)}
        className="mt-4 flex items-center gap-1.5 text-xs font-semibold text-emerald-100/60 hover:text-emerald-100"
      >
        <ChevronDown className={`h-4 w-4 transition-transform ${showText ? 'rotate-180' : ''}`} />
        עריכת מילים וסוגי שורות (מתקדם)
      </button>

      {showText && (
        <div className="mt-3 space-y-3 rounded-xl border border-white/10 bg-black/30 p-3">
          <p className="text-[11px] text-emerald-100/60">שורה אחת לכל משפט. שינוי טקסט מאפס את הסימונים.</p>
          <textarea
            value={lyricsText}
            onChange={(e) => setLyricsText(e.target.value)}
            rows={Math.max(4, lines.length)}
            className="w-full rounded-lg border border-white/10 bg-black/40 p-2.5 text-sm leading-relaxed text-white outline-none focus:border-emerald-400/60"
            dir="rtl"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={applyLyricsText}
              className="h-9 rounded-xl bg-emerald-500/90 px-3 text-xs font-bold text-[#04231a] transition hover:bg-emerald-400"
            >
              עדכן מילים
            </button>
            <button
              type="button"
              onClick={loadDefaults}
              className="flex h-9 items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3 text-xs font-semibold text-white/80 transition hover:bg-white/10"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              ברירת מחדל
            </button>
          </div>

          {/* per-line kind/tag */}
          <div className="space-y-1.5">
            {lines.map((line, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className="min-w-0 flex-1 truncate text-white/70">{line.text}</span>
                <select
                  value={line.kind ?? 'normal'}
                  onChange={(e) =>
                    setLines((prev) =>
                      prev.map((l, j) =>
                        j === i ? { ...l, kind: e.target.value as LyricLineConfig['kind'] } : l,
                      ),
                    )
                  }
                  className="h-8 rounded-lg border border-white/10 bg-black/40 px-1.5 text-white outline-none"
                >
                  <option value="normal">רגיל</option>
                  <option value="drop">דרופ</option>
                  <option value="mega">מגה</option>
                </select>
                {(line.kind === 'drop' || line.kind === 'mega') && (
                  <input
                    value={line.tag ?? ''}
                    onChange={(e) =>
                      setLines((prev) => prev.map((l, j) => (j === i ? { ...l, tag: e.target.value } : l)))
                    }
                    placeholder="תווית"
                    className="h-8 w-20 rounded-lg border border-white/10 bg-black/40 px-2 text-white outline-none"
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {error ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-red-300">
          <AlertTriangle className="h-4 w-4" /> {error}
        </p>
      ) : null}
      {success ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-emerald-300">
          <CheckCircle2 className="h-4 w-4" /> {success}
        </p>
      ) : null}
    </div>
  );
}
