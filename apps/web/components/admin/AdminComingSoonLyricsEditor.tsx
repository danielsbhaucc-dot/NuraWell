'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Crosshair,
  Loader2,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Save,
  SkipBack,
  Target,
  Trash2,
} from 'lucide-react';
import {
  DEFAULT_LYRICS,
  type ComingSoonLyrics,
  type LyricKind,
  type LyricLineConfig,
} from '@/lib/coming-soon/lyrics';

const KIND_LABEL: Record<LyricKind, string> = {
  normal: 'רגיל',
  drop: 'דרופ',
  mega: 'מגה',
};

function fmt(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0.00';
  return sec.toFixed(2);
}

export function AdminComingSoonLyricsEditor({ songUrl }: { songUrl: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [lines, setLines] = useState<LyricLineConfig[]>(DEFAULT_LYRICS.lines);
  const [syncOffset, setSyncOffset] = useState<number>(DEFAULT_LYRICS.syncOffset ?? 0.18);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [tapMode, setTapMode] = useState(false);
  const [tapIndex, setTapIndex] = useState(0);

  // current time display (throttled)
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    let last = 0;
    const onTime = () => {
      const now = performance.now();
      if (now - last > 80) {
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

  // load saved lyrics
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/v1/admin/coming-soon-lyrics', { credentials: 'include' });
        const data = (await res.json()) as { lyrics?: ComingSoonLyrics };
        if (!cancelled && data.lyrics?.lines?.length) {
          setLines(data.lyrics.lines);
          setSyncOffset(typeof data.lyrics.syncOffset === 'number' ? data.lyrics.syncOffset : 0.18);
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

  const togglePlay = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) void a.play();
    else a.pause();
  }, []);

  const seekTo = useCallback((sec: number) => {
    const a = audioRef.current;
    if (!a) return;
    a.currentTime = Math.max(0, sec);
    setCurrentTime(a.currentTime);
  }, []);

  const setStartFromAudio = useCallback((idx: number) => {
    const a = audioRef.current;
    if (!a) return;
    const t = Number(a.currentTime.toFixed(2));
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, start: t } : l)));
  }, []);

  const updateLine = useCallback((idx: number, patch: Partial<LyricLineConfig>) => {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }, []);

  const addLine = useCallback(() => {
    const a = audioRef.current;
    const t = a ? Number(a.currentTime.toFixed(2)) : 0;
    setLines((prev) => [...prev, { text: 'שורה חדשה', start: t, kind: 'normal' }]);
  }, []);

  const removeLine = useCallback((idx: number) => {
    setLines((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const loadDefaults = useCallback(() => {
    setLines(DEFAULT_LYRICS.lines);
    setSyncOffset(DEFAULT_LYRICS.syncOffset ?? 0.18);
    setSuccess(null);
    setError(null);
  }, []);

  // tap-through workflow
  const startTapMode = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    a.currentTime = 0;
    setTapIndex(0);
    setTapMode(true);
    void a.play();
  }, []);

  const tapNext = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    const t = Number(a.currentTime.toFixed(2));
    setLines((prev) => prev.map((l, i) => (i === tapIndex ? { ...l, start: t } : l)));
    setTapIndex((i) => {
      const next = i + 1;
      if (next >= lines.length) {
        setTapMode(false);
        return 0;
      }
      return next;
    });
  }, [tapIndex, lines.length]);

  // spacebar = tap during tap mode
  useEffect(() => {
    if (!tapMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        tapNext();
      } else if (e.code === 'Escape') {
        setTapMode(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tapMode, tapNext]);

  const save = useCallback(async () => {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const payload: ComingSoonLyrics = {
        syncOffset,
        lines: lines
          .map((l) => ({
            text: l.text.trim(),
            start: Number(l.start) || 0,
            kind: l.kind ?? 'normal',
            tag: l.tag?.trim() || undefined,
          }))
          .filter((l) => l.text.length > 0),
      };
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
      setSuccess('התזמונים נשמרו. רענן את עמוד "בקרוב" כדי לראות.');
    } catch {
      setError('שגיאת רשת');
    } finally {
      setBusy(false);
    }
  }, [lines, syncOffset]);

  // index of the line currently being sung (for live highlight)
  const activeIdx = (() => {
    let idx = -1;
    const ct = currentTime + syncOffset;
    for (let i = 0; i < lines.length; i++) {
      if (ct >= lines[i].start) idx = i;
    }
    return idx;
  })();

  return (
    <div className="mt-5 rounded-2xl border border-emerald-300/30 bg-slate-900/90 p-4 text-white shadow-inner" dir="rtl">
      <audio ref={audioRef} src={songUrl} preload="metadata" />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white">
            <Target className="h-4 w-4" />
          </span>
          <div>
            <h3 className="text-sm font-black">מערכת סנכרון מילים</h3>
            <p className="text-[11px] text-emerald-100/60">נגן את השיר וסמן מתי כל שורה מתחילה — דיוק מושלם.</p>
          </div>
        </div>
        <div className="rounded-xl bg-black/40 px-3 py-1.5 text-center font-mono text-lg font-bold tabular-nums text-lime-300">
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
          onClick={() => seekTo(0)}
          className="flex h-10 items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3 text-sm font-semibold text-white/80 transition hover:bg-white/10"
        >
          <SkipBack className="h-4 w-4" />
          להתחלה
        </button>
        <button
          type="button"
          onClick={() => seekTo(currentTime - 2)}
          className="h-10 rounded-xl border border-white/15 bg-white/5 px-3 text-sm font-semibold text-white/80 transition hover:bg-white/10"
        >
          ‹ 2 שנ׳
        </button>
        {!tapMode ? (
          <button
            type="button"
            onClick={startTapMode}
            className="flex h-10 items-center gap-1.5 rounded-xl bg-gradient-to-l from-lime-400 to-emerald-400 px-4 text-sm font-black text-[#04231a] transition hover:brightness-105"
          >
            <Crosshair className="h-4 w-4" />
            מצב תקתוק
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setTapMode(false)}
            className="h-10 rounded-xl border border-red-300/40 bg-red-500/20 px-4 text-sm font-bold text-red-100"
          >
            עצור תקתוק
          </button>
        )}
      </div>

      {/* offset slider */}
      <div className="mt-4 rounded-xl bg-black/30 p-3">
        <div className="flex items-center justify-between text-xs font-semibold text-emerald-100/80">
          <span>היסט סנכרון גלובלי</span>
          <span className="font-mono tabular-nums text-lime-300">{syncOffset >= 0 ? '+' : ''}{syncOffset.toFixed(2)}s</span>
        </div>
        <input
          type="range"
          min={-1}
          max={1}
          step={0.02}
          value={syncOffset}
          onChange={(e) => setSyncOffset(Number(e.target.value))}
          className="mt-2 w-full accent-emerald-400"
        />
        <p className="mt-1 text-[11px] text-emerald-100/50">חיובי = ההדגשה מקדימה (אם יש דיליי, הגדל מעט).</p>
      </div>

      {tapMode && (
        <button
          type="button"
          onClick={tapNext}
          className="mt-4 w-full rounded-2xl bg-gradient-to-l from-lime-400 to-emerald-400 px-4 py-5 text-center text-lg font-black text-[#04231a] shadow-lg transition active:scale-[0.99]"
        >
          סמן שורה {tapIndex + 1}/{lines.length}: «{lines[tapIndex]?.text}»
          <span className="mt-1 block text-xs font-semibold opacity-70">(או הקש רווח · Esc ליציאה)</span>
        </button>
      )}

      {/* lines list */}
      <div className="mt-4 space-y-2">
        {lines.map((line, i) => (
          <div
            key={i}
            className={`rounded-xl border p-2.5 transition ${
              i === activeIdx ? 'border-lime-400/60 bg-lime-400/10' : 'border-white/10 bg-white/[0.03]'
            }`}
          >
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setStartFromAudio(i)}
                title="קבע התחלה לפי הזמן הנוכחי"
                className="flex h-9 shrink-0 items-center gap-1 rounded-lg bg-emerald-500/90 px-2.5 text-xs font-bold text-[#04231a] transition hover:bg-emerald-400"
              >
                <Crosshair className="h-3.5 w-3.5" />
                סמן
              </button>
              <button
                type="button"
                onClick={() => seekTo(line.start)}
                title="קפוץ לזמן הזה"
                className="h-9 w-16 shrink-0 rounded-lg bg-black/40 font-mono text-sm font-bold tabular-nums text-lime-300 transition hover:bg-black/60"
              >
                {fmt(line.start)}
              </button>
              <input
                value={line.text}
                onChange={(e) => updateLine(i, { text: e.target.value })}
                className="h-9 min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-2.5 text-sm text-white outline-none focus:border-emerald-400/60"
                placeholder="טקסט השורה"
              />
              <button
                type="button"
                onClick={() => removeLine(i)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-red-300/30 bg-red-500/10 text-red-200 transition hover:bg-red-500/20"
                aria-label="מחק שורה"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-2 flex items-center gap-2 pr-[4.5rem]">
              <div className="flex overflow-hidden rounded-lg border border-white/10">
                {(['normal', 'drop', 'mega'] as LyricKind[]).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => updateLine(i, { kind: k })}
                    className={`px-2.5 py-1 text-xs font-bold transition ${
                      (line.kind ?? 'normal') === k
                        ? 'bg-emerald-500 text-[#04231a]'
                        : 'bg-black/30 text-white/60 hover:bg-black/50'
                    }`}
                  >
                    {KIND_LABEL[k]}
                  </button>
                ))}
              </div>
              {(line.kind === 'drop' || line.kind === 'mega') && (
                <input
                  value={line.tag ?? ''}
                  onChange={(e) => updateLine(i, { tag: e.target.value })}
                  className="h-8 w-24 rounded-lg border border-white/10 bg-black/30 px-2 text-xs text-white outline-none focus:border-emerald-400/60"
                  placeholder='תווית (כן!)'
                />
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={addLine}
          className="flex h-10 items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3 text-sm font-semibold text-white/80 transition hover:bg-white/10"
        >
          <Plus className="h-4 w-4" />
          הוסף שורה
        </button>
        <button
          type="button"
          onClick={loadDefaults}
          className="flex h-10 items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3 text-sm font-semibold text-white/80 transition hover:bg-white/10"
        >
          <RotateCcw className="h-4 w-4" />
          ברירת מחדל
        </button>
        <button
          type="button"
          disabled={busy || !loaded}
          onClick={() => void save()}
          className="ml-auto flex h-10 items-center gap-2 rounded-xl bg-gradient-to-l from-emerald-600 to-teal-600 px-5 text-sm font-bold text-white shadow-lg transition hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          שמור תזמונים
        </button>
      </div>

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
