'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Disc3,
  Eye,
  EyeOff,
  ListMusic,
  Loader2,
  Music,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  AudioTranscodeUnsupportedError,
  transcodeToMp3,
  type TranscodeResult,
} from '@/lib/audio/transcode-client';
import type { AudioCredit, AudioTrack, AudioPlaylistSummary } from '@/lib/types/audio';

type TrackWithUrl = AudioTrack & { url: string | null };

/** הגנת אחסון: ההעלאה עצמה מתבצעת ישירות ל-R2, לא דרך Vercel. */
const UPLOAD_SIZE_LIMIT = 25 * 1024 * 1024;
const BITRATE_LADDER = [128, 96, 64];

function formatBytes(n: number | null | undefined): string {
  if (!n || n <= 0) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return '—';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

async function transcodeUnderLimit(
  file: File,
  onProgress: (f: number) => void
): Promise<TranscodeResult> {
  let last: TranscodeResult | null = null;
  for (const kbps of BITRATE_LADDER) {
    const res = await transcodeToMp3(file, { kbps, onProgress });
    last = res;
    if (res.blob.size <= UPLOAD_SIZE_LIMIT) return res;
  }
  return last as TranscodeResult;
}

const cardClass =
  'relative overflow-hidden rounded-3xl border border-white/40 bg-white/45 p-4 shadow-[0_12px_40px_rgba(15,23,42,0.12)] backdrop-blur-2xl sm:p-6';

export function AdminAudioPlaylistsClient() {
  const [playlists, setPlaylists] = useState<AudioPlaylistSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // create form
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [creating, setCreating] = useState(false);

  const loadPlaylists = useCallback(async () => {
    setLoading(true);
    setListError(null);
    try {
      const res = await fetch('/api/v1/admin/audio/playlists', { credentials: 'include' });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        setListError(e.error || `שגיאה ${res.status}`);
        return;
      }
      setPlaylists((await res.json()) as AudioPlaylistSummary[]);
    } catch {
      setListError('שגיאת רשת בטעינת הפלייליסטים');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPlaylists();
  }, [loadPlaylists]);

  const createPlaylist = async () => {
    if (!newTitle.trim() || creating) return;
    setCreating(true);
    try {
      const res = await fetch('/api/v1/admin/audio/playlists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle.trim(), description: newDescription.trim() || null }),
      });
      if (res.ok) {
        const created = (await res.json()) as AudioPlaylistSummary;
        setNewTitle('');
        setNewDescription('');
        setPlaylists((p) => [created, ...p]);
        setSelectedId(created.id);
      }
    } finally {
      setCreating(false);
    }
  };

  const togglePublish = async (pl: AudioPlaylistSummary) => {
    const res = await fetch(`/api/v1/admin/audio/playlists/${pl.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_published: !pl.is_published }),
    });
    if (res.ok) {
      setPlaylists((list) =>
        list.map((x) => (x.id === pl.id ? { ...x, is_published: !pl.is_published } : x))
      );
    }
  };

  const deletePlaylist = async (pl: AudioPlaylistSummary) => {
    if (!confirm(`למחוק את הפלייליסט "${pl.title}" וכל הרצועות שבו? פעולה זו תמחק גם את הקבצים מ-R2.`)) {
      return;
    }
    const res = await fetch(`/api/v1/admin/audio/playlists/${pl.id}`, { method: 'DELETE' });
    if (res.ok) {
      setPlaylists((list) => list.filter((x) => x.id !== pl.id));
      if (selectedId === pl.id) setSelectedId(null);
    }
  };

  const adjustTrackCount = useCallback((playlistId: string, delta: number) => {
    setPlaylists((list) =>
      list.map((x) => (x.id === playlistId ? { ...x, track_count: Math.max(0, x.track_count + delta) } : x))
    );
  }, []);

  const selected = useMemo(
    () => playlists.find((p) => p.id === selectedId) ?? null,
    [playlists, selectedId]
  );

  return (
    <div className="space-y-6">
      {/* יצירת פלייליסט */}
      <section className={cardClass} dir="rtl">
        <h2 className="flex items-center gap-2 text-lg font-black text-slate-800">
          <ListMusic className="h-5 w-5 text-emerald-500" />
          פלייליסט חדש
        </h2>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1.4fr_auto] sm:items-end">
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-slate-600">שם הפלייליסט</span>
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="למשל: רגיעה עמוקה"
              className="w-full rounded-xl border border-white/60 bg-white/70 px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-emerald-400"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-slate-600">תיאור (אופציונלי)</span>
            <input
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="מוזיקה שקטה למדיטציה ולמעבר בין שלבים"
              className="w-full rounded-xl border border-white/60 bg-white/70 px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-emerald-400"
            />
          </label>
          <button
            type="button"
            onClick={() => void createPlaylist()}
            disabled={!newTitle.trim() || creating}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-l from-emerald-600 to-teal-500 px-5 py-2.5 font-bold text-white disabled:opacity-45"
          >
            {creating ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5" />}
            צור
          </button>
        </div>
      </section>

      {/* רשימת פלייליסטים */}
      <section className={cardClass} dir="rtl">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-black text-slate-800">
          <Disc3 className="h-5 w-5 text-emerald-500" />
          הפלייליסטים שלי
        </h2>

        {loading ? (
          <div className="flex items-center gap-2 py-6 text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin" /> טוען…
          </div>
        ) : listError ? (
          <p className="flex items-center gap-2 py-4 text-sm text-red-700">
            <AlertTriangle className="h-4 w-4" /> {listError}
          </p>
        ) : playlists.length === 0 ? (
          <p className="py-4 text-sm text-slate-500">עדיין אין פלייליסטים. צרו אחד למעלה.</p>
        ) : (
          <ul className="space-y-2.5">
            {playlists.map((pl) => {
              const active = pl.id === selectedId;
              return (
                <li key={pl.id}>
                  <div
                    className={[
                      'flex items-center gap-3 rounded-2xl border px-3 py-3 transition-colors',
                      active
                        ? 'border-emerald-400/70 bg-emerald-50/80'
                        : 'border-white/60 bg-white/55 hover:bg-white/75',
                    ].join(' ')}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedId(active ? null : pl.id)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-right"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 text-emerald-700">
                        <Music className="h-5 w-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-bold text-slate-800">{pl.title}</span>
                        <span className="block truncate text-xs text-slate-500">
                          {pl.track_count} רצועות
                          {pl.description ? ` · ${pl.description}` : ''}
                        </span>
                      </span>
                    </button>

                    <span
                      className={[
                        'hidden shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold sm:inline',
                        pl.is_published ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500',
                      ].join(' ')}
                    >
                      {pl.is_published ? 'פורסם' : 'טיוטה'}
                    </span>

                    <button
                      type="button"
                      onClick={() => void togglePublish(pl)}
                      title={pl.is_published ? 'הסתר (טיוטה)' : 'פרסם'}
                      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/60 bg-white/60 text-slate-600 hover:bg-white/90"
                    >
                      {pl.is_published ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => void deletePlaylist(pl)}
                      title="מחק פלייליסט"
                      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-red-200/70 bg-red-50/70 text-red-600 hover:bg-red-100"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  {active && (
                    <PlaylistTrackManager
                      playlistId={pl.id}
                      onTrackAdded={() => adjustTrackCount(pl.id, 1)}
                      onTrackRemoved={() => adjustTrackCount(pl.id, -1)}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {selected && !loading && (
        <p className="px-1 text-xs text-slate-500">
          טיפ: שייכו פלייליסט לצעד דרך עורך הצעד (&quot;רשימת צעדים&quot; → עריכה → פרטים בסיסיים → מוזיקת רקע).
        </p>
      )}
    </div>
  );
}

/* ============================ ניהול רצועות בפלייליסט ============================ */

interface PlaylistTrackManagerProps {
  playlistId: string;
  onTrackAdded: () => void;
  onTrackRemoved: () => void;
}

function PlaylistTrackManager({ playlistId, onTrackAdded, onTrackRemoved }: PlaylistTrackManagerProps) {
  const [tracks, setTracks] = useState<TrackWithUrl[]>([]);
  const [loading, setLoading] = useState(true);

  const loadTracks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/admin/audio/playlists/${playlistId}`, { credentials: 'include' });
      if (res.ok) {
        const data = (await res.json()) as { tracks: TrackWithUrl[] };
        setTracks(data.tracks ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [playlistId]);

  useEffect(() => {
    void loadTracks();
  }, [loadTracks]);

  const deleteTrack = async (track: TrackWithUrl) => {
    if (!confirm(`למחוק את "${track.title}"? הקובץ יימחק גם מ-R2.`)) return;
    const res = await fetch(`/api/v1/admin/audio/tracks/${track.id}`, { method: 'DELETE' });
    if (res.ok) {
      setTracks((t) => t.filter((x) => x.id !== track.id));
      onTrackRemoved();
    }
  };

  return (
    <div className="mt-2 rounded-2xl border border-emerald-200/60 bg-white/40 p-3 sm:p-4">
      <TrackUploader
        playlistId={playlistId}
        onUploaded={(track) => {
          setTracks((t) => [...t, track]);
          onTrackAdded();
        }}
      />

      <div className="mt-4">
        <h4 className="mb-2 text-sm font-black text-slate-700">רצועות בפלייליסט</h4>
        {loading ? (
          <div className="flex items-center gap-2 py-3 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> טוען רצועות…
          </div>
        ) : tracks.length === 0 ? (
          <p className="py-2 text-sm text-slate-500">אין עדיין רצועות. העלו קובץ אודיו למעלה.</p>
        ) : (
          <ul className="space-y-2">
            {tracks.map((track) => (
              <li
                key={track.id}
                className="rounded-xl border border-white/60 bg-white/65 p-3"
              >
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-slate-800">{track.title}</span>
                    <span className="block truncate text-[11px] text-slate-500">
                      {formatDuration(track.duration_seconds)} · {formatBytes(track.size_bytes)} ·{' '}
                      {track.credit?.author ? `${track.credit.author} (${track.credit.source})` : 'ללא קרדיט'}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => void deleteTrack(track)}
                    title="מחק רצועה"
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-red-200/70 bg-red-50/70 text-red-600 hover:bg-red-100"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                {track.url && (
                  // eslint-disable-next-line jsx-a11y/media-has-caption
                  <audio src={track.url} controls preload="none" className="mt-2 h-9 w-full" />
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ============================ העלאת רצועה ============================ */

interface TrackUploaderProps {
  playlistId: string;
  onUploaded: (track: TrackWithUrl) => void;
}

const emptyCredit: AudioCredit = {
  source: 'Pixabay',
  author: '',
  title: '',
  link: '',
  license: 'Pixabay Content License',
};

function TrackUploader({ playlistId, onUploaded }: TrackUploaderProps) {
  const inputId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [credit, setCredit] = useState<AudioCredit>(emptyCredit);
  const [dragOver, setDragOver] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'transcoding' | 'uploading'>('idle');
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ ok?: boolean; error?: string; savedPercent?: number } | null>(null);

  const busy = phase !== 'idle';

  const pick = (list: FileList | null) => {
    const f = list?.[0];
    if (!f) return;
    if (!f.type.startsWith('audio/') && !/\.(mp3|wav|ogg|m4a|aac|flac|opus|webm)$/i.test(f.name)) {
      setResult({ error: 'יש לבחור קובץ אודיו' });
      return;
    }
    setFile(f);
    setResult(null);
    if (!title.trim()) setTitle(f.name.replace(/\.[^.]+$/, ''));
  };

  const reset = () => {
    setFile(null);
    setTitle('');
    setCredit(emptyCredit);
    setProgress(0);
    if (fileRef.current) fileRef.current.value = '';
  };

  const upload = async () => {
    if (!file || busy) return;
    if (!title.trim()) {
      setResult({ error: 'יש להזין שם לרצועה' });
      return;
    }
    if (!credit.author.trim() || !credit.source.trim()) {
      setResult({ error: 'יש להזין יוצר ומקור (קרדיט)' });
      return;
    }
    setResult(null);

    let transcoded: TranscodeResult;
    try {
      setPhase('transcoding');
      setProgress(0);
      transcoded = await transcodeUnderLimit(file, (f) => setProgress(Math.round(f * 100)));
    } catch (e) {
      setPhase('idle');
      setResult({
        error:
          e instanceof AudioTranscodeUnsupportedError
            ? 'הדפדפן לא הצליח לפענח/לדחוס את הקובץ. נסו MP3/WAV אחר.'
            : 'דחיסת האודיו נכשלה.',
      });
      return;
    }

    if (transcoded.blob.size > UPLOAD_SIZE_LIMIT) {
      setPhase('idle');
      setResult({
        error: `הקובץ עדיין גדול מדי אחרי דחיסה (${formatBytes(transcoded.blob.size)}). נסו רצועה קצרה יותר כדי לא לעבור את מגבלת ההעלאה.`,
      });
      return;
    }

    try {
      const mp3 = new File([transcoded.blob], `${title.trim()}.mp3`, { type: 'audio/mpeg' });
      const cleanCredit = {
        source: credit.source.trim(),
        author: credit.author.trim(),
        title: credit.title?.trim() || null,
        link: credit.link?.trim() || null,
        license: credit.license?.trim() || null,
      };
      const metadata = {
        title: title.trim(),
        duration_seconds: Math.round(transcoded.durationSeconds),
        size_bytes: mp3.size,
        credit: cleanCredit,
      };

      setPhase('uploading');
      const presignRes = await fetch(`/api/v1/admin/audio/playlists/${playlistId}/tracks/presign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(metadata),
      });
      const presign = (await presignRes.json().catch(() => ({}))) as {
        error?: string;
        track_id?: string;
        object_key?: string;
        upload_url?: string;
      };
      if (!presignRes.ok || !presign.track_id || !presign.object_key || !presign.upload_url) {
        setResult({ error: presign.error || `שגיאה בהכנת העלאה (${presignRes.status})` });
        return;
      }

      const putRes = await fetch(presign.upload_url, {
        method: 'PUT',
        headers: { 'Content-Type': 'audio/mpeg' },
        body: mp3,
      });
      if (!putRes.ok) {
        setResult({
          error:
            putRes.status === 0
              ? 'העלאה ישירה ל-R2 נכשלה. בדוק CORS בדלי האודיו.'
              : `העלאה ישירה ל-R2 נכשלה (${putRes.status}). בדוק CORS והרשאות לדלי.`,
        });
        return;
      }

      const completeRes = await fetch(`/api/v1/admin/audio/playlists/${playlistId}/tracks/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...metadata,
          track_id: presign.track_id,
          object_key: presign.object_key,
        }),
      });
      const data = await completeRes.json().catch(() => ({}));
      if (!completeRes.ok) {
        setResult({ error: (data as { error?: string }).error || `שגיאה בשמירת הרצועה (${completeRes.status})` });
        return;
      }
      const savedPercent = Math.max(
        0,
        Math.round((1 - transcoded.optimizedBytes / Math.max(1, transcoded.originalBytes)) * 100)
      );
      onUploaded(data as TrackWithUrl);
      setResult({ ok: true, savedPercent });
      reset();
    } catch {
      setResult({ error: 'שגיאת רשת בהעלאה' });
    } finally {
      setPhase('idle');
    }
  };

  return (
    <div className="rounded-2xl border border-white/60 bg-white/55 p-3 sm:p-4" dir="rtl">
      <h4 className="mb-3 flex items-center gap-2 text-sm font-black text-slate-700">
        <Upload className="h-4 w-4 text-emerald-600" />
        העלאת רצועה
      </h4>

      <input
        ref={fileRef}
        id={inputId}
        type="file"
        accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac,.opus"
        className="sr-only"
        onChange={(e) => pick(e.target.files)}
      />

      <label
        htmlFor={inputId}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          pick(e.dataTransfer.files);
        }}
        className={[
          'flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-all',
          dragOver ? 'border-emerald-500 bg-emerald-50/90' : 'border-emerald-200/90 bg-emerald-50/40',
        ].join(' ')}
      >
        <Music className="h-5 w-5 text-emerald-600" />
        <p className="text-sm font-bold text-slate-800">גרור קובץ אודיו או לחץ לבחירה</p>
        {file ? (
          <p className="text-xs text-emerald-800">
            {file.name} · {formatBytes(file.size)}
          </p>
        ) : (
          <p className="text-[11px] text-slate-500">הקובץ יידחס ל-MP3 בדפדפן לפני ההעלאה</p>
        )}
      </label>

      {/* פרטי רצועה + קרדיט */}
      <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-xs font-bold text-slate-600">שם הרצועה</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-lg border border-white/60 bg-white/80 px-3 py-2 text-sm outline-none focus:border-emerald-400"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-bold text-slate-600">מקור</span>
          <input
            value={credit.source}
            onChange={(e) => setCredit((c) => ({ ...c, source: e.target.value }))}
            className="w-full rounded-lg border border-white/60 bg-white/80 px-3 py-2 text-sm outline-none focus:border-emerald-400"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-bold text-slate-600">יוצר / אמן</span>
          <input
            value={credit.author}
            onChange={(e) => setCredit((c) => ({ ...c, author: e.target.value }))}
            placeholder="שם היוצר ב-Pixabay"
            className="w-full rounded-lg border border-white/60 bg-white/80 px-3 py-2 text-sm outline-none focus:border-emerald-400"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-bold text-slate-600">שם היצירה (אופציונלי)</span>
          <input
            value={credit.title ?? ''}
            onChange={(e) => setCredit((c) => ({ ...c, title: e.target.value }))}
            className="w-full rounded-lg border border-white/60 bg-white/80 px-3 py-2 text-sm outline-none focus:border-emerald-400"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-bold text-slate-600">קישור למקור (אופציונלי)</span>
          <input
            value={credit.link ?? ''}
            onChange={(e) => setCredit((c) => ({ ...c, link: e.target.value }))}
            placeholder="https://pixabay.com/..."
            dir="ltr"
            className="w-full rounded-lg border border-white/60 bg-white/80 px-3 py-2 text-sm outline-none focus:border-emerald-400"
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-xs font-bold text-slate-600">רישיון (אופציונלי)</span>
          <input
            value={credit.license ?? ''}
            onChange={(e) => setCredit((c) => ({ ...c, license: e.target.value }))}
            className="w-full rounded-lg border border-white/60 bg-white/80 px-3 py-2 text-sm outline-none focus:border-emerald-400"
          />
        </label>
      </div>

      <button
        type="button"
        onClick={() => void upload()}
        disabled={!file || busy}
        className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-l from-emerald-600 to-teal-500 px-5 py-2.5 font-bold text-white disabled:opacity-45"
      >
        {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
        {phase === 'transcoding'
          ? `דוחס… ${progress}%`
          : phase === 'uploading'
            ? 'מעלה…'
            : 'דחוס והעלה'}
      </button>

      {result?.error ? (
        <p className="mt-2 flex items-center gap-2 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {result.error}
        </p>
      ) : result?.ok ? (
        <p className="mt-2 flex items-center gap-2 text-sm text-emerald-800">
          <CheckCircle2 className="h-4 w-4" /> נשמר ל-CDN
          {result.savedPercent != null ? ` · ${result.savedPercent}% פחות נפח` : ''}
        </p>
      ) : null}
    </div>
  );
}
