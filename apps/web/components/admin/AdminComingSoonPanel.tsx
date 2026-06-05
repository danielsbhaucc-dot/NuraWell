'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Music4,
  Pause,
  Play,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { useMediaManager } from '@/components/media-manager/MediaManagerProvider';
import type { MediaAsset } from '@/components/media-manager/types';
import { GlassConfirmDialog } from '@/components/media-manager/GlassConfirmDialog';

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** נגן אודיו מעוצב (זכוכית) — לתצוגה מקדימה של השיר בלוח הבקרה */
function GlassAudioPlayer({ src, title }: { src: string; title: string | null }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onTime = () => setCurrent(a.currentTime);
    const onMeta = () => setDuration(a.duration || 0);
    const onEnd = () => setPlaying(false);
    a.addEventListener('timeupdate', onTime);
    a.addEventListener('loadedmetadata', onMeta);
    a.addEventListener('ended', onEnd);
    return () => {
      a.removeEventListener('timeupdate', onTime);
      a.removeEventListener('loadedmetadata', onMeta);
      a.removeEventListener('ended', onEnd);
    };
  }, [src]);

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) {
      void a.play();
      setPlaying(true);
    } else {
      a.pause();
      setPlaying(false);
    }
  };

  const seek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const a = audioRef.current;
    if (!a) return;
    const v = Number(e.target.value);
    a.currentTime = v;
    setCurrent(v);
  };

  const pct = duration > 0 ? (current / duration) * 100 : 0;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-emerald-300/30 bg-gradient-to-br from-emerald-500/10 via-teal-500/5 to-transparent p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.4)] backdrop-blur-xl">
      <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-emerald-400/20 blur-3xl" />
      <audio ref={audioRef} src={src} preload="metadata" />
      <div className="relative flex items-center gap-3">
        <button
          type="button"
          onClick={toggle}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-600/40 transition active:scale-95"
          aria-label={playing ? 'השהה' : 'נגן'}
        >
          {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 translate-x-[1px] fill-white" />}
        </button>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 truncate text-sm font-bold text-slate-800">
            <Music4 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
            {title || 'שיר נבחר'}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <span className="w-9 text-left text-[11px] font-semibold tabular-nums text-slate-500">
              {formatTime(current)}
            </span>
            <div className="relative flex-1">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-300/50">
                <div
                  className="h-full rounded-full bg-gradient-to-l from-emerald-500 to-teal-400"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <input
                type="range"
                min={0}
                max={duration || 0}
                step={0.1}
                value={current}
                onChange={seek}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                aria-label="מיקום בשיר"
              />
            </div>
            <span className="w-9 text-[11px] font-semibold tabular-nums text-slate-500">
              {formatTime(duration)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AdminComingSoonPanel() {
  const { open } = useMediaManager();
  const [songUrl, setSongUrl] = useState<string | null>(null);
  const [songTitle, setSongTitle] = useState<string | null>(null);
  const [applyBusy, setApplyBusy] = useState(false);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const loadCurrent = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/admin/coming-soon-song', { credentials: 'include' });
      const data = (await res.json()) as { song_url?: string | null; song_title?: string | null };
      setSongUrl(data.song_url ?? null);
      setSongTitle(data.song_title ?? null);
    } catch {
      setSongUrl(null);
    }
  }, []);

  useEffect(() => {
    void loadCurrent();
  }, [loadCurrent]);

  const applyAsset = async (asset: MediaAsset) => {
    const url = asset.url ?? asset.public_url;
    if (!url || applyBusy) {
      if (!url) setError('לא ניתן היה לקבל כתובת לקובץ האודיו.');
      return;
    }
    setApplyBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch('/api/v1/admin/coming-soon-song', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ song_url: url, song_title: asset.title ?? asset.original_filename ?? undefined }),
      });
      const data = (await res.json()) as { ok?: boolean; song_url?: string; song_title?: string; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error || 'שמירה נכשלה');
        return;
      }
      setSongUrl(data.song_url ?? url);
      setSongTitle(data.song_title ?? asset.title ?? null);
      setSuccess('השיר לעמוד "בקרוב" עודכן.');
    } catch {
      setError('שגיאת רשת');
    } finally {
      setApplyBusy(false);
    }
  };

  const remove = async () => {
    setRemoveBusy(true);
    try {
      const res = await fetch('/api/v1/admin/coming-soon-song', { method: 'DELETE', credentials: 'include' });
      if (!res.ok) {
        setError('הסרה נכשלה');
        return;
      }
      setSongUrl(null);
      setSongTitle(null);
      setSuccess('השיר הוסר מעמוד "בקרוב".');
    } catch {
      setError('שגיאת רשת');
    } finally {
      setRemoveBusy(false);
      setConfirmRemove(false);
    }
  };

  return (
    <section
      className="relative overflow-hidden rounded-3xl border border-white/40 bg-white/40 p-5 backdrop-blur-xl"
      dir="rtl"
    >
      <div className="pointer-events-none absolute -left-16 -top-16 h-40 w-40 rounded-full bg-emerald-400/20 blur-3xl" />
      <div className="relative flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md">
          <Music4 className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-lg font-black text-slate-800">שיר עמוד "בקרוב"</h2>
          <p className="text-sm text-slate-600">
            בחר את שיר ה-30 שניות (מספריית המדיה → אודיו). הוא ינוגן בעמוד עם מילות שיר מסונכרנות.
          </p>
        </div>
      </div>

      <div className="relative mt-4">
        {songUrl ? (
          <GlassAudioPlayer src={songUrl} title={songTitle} />
        ) : (
          <div className="flex items-center justify-center rounded-2xl border border-dashed border-slate-300/70 bg-white/30 px-4 py-8 text-sm text-slate-500">
            עדיין לא נבחר שיר.
          </div>
        )}
      </div>

      <p className="relative mt-3 flex items-center gap-1.5 text-xs text-emerald-800/80">
        <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
        כל קובץ אודיו שמועלה דרך ספריית המדיה נדחס אוטומטית ל-MP3 קליל (עד 25MB) — מהיר לטעינה ולנגינה.
      </p>

      <div className="relative mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={applyBusy}
          onClick={() =>
            open({
              kind: 'audio',
              mode: 'pick',
              title: 'בחירת שיר לעמוד "בקרוב"',
              onSelect: (a) => void applyAsset(a),
            })
          }
          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-gradient-to-l from-emerald-600 to-teal-600 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-emerald-600/30 transition hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50"
        >
          {applyBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Music4 className="h-4 w-4" />}
          {songUrl ? 'החלף שיר' : 'בחר שיר'}
        </button>

        <a
          href="/coming-soon"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-emerald-300/60 bg-white/40 px-4 py-2 text-sm font-bold text-emerald-900 transition hover:bg-white/70"
        >
          <ExternalLink className="h-4 w-4" />
          תצוגה מקדימה
        </a>

        {songUrl ? (
          <button
            type="button"
            onClick={() => setConfirmRemove(true)}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-red-300/60 bg-red-500/10 px-3 py-2 text-sm font-bold text-red-900"
          >
            <Trash2 className="h-4 w-4" />
            הסר
          </button>
        ) : null}
      </div>

      {error ? (
        <p className="relative mt-3 flex items-center gap-2 text-sm text-red-800">
          <AlertTriangle className="h-4 w-4" /> {error}
        </p>
      ) : null}
      {success ? (
        <p className="relative mt-3 flex items-center gap-2 text-sm text-emerald-800">
          <CheckCircle2 className="h-4 w-4" /> {success}
        </p>
      ) : null}

      <GlassConfirmDialog
        open={confirmRemove}
        title="הסרת שיר"
        message='להסיר את השיר מעמוד "בקרוב"?'
        danger
        busy={removeBusy}
        onCancel={() => setConfirmRemove(false)}
        onConfirm={() => void remove()}
      />
    </section>
  );
}
