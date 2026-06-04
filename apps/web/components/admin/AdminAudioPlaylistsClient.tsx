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
  MapPin,
  Music,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  AudioTranscodeUnsupportedError,
  transcodeToMp3,
  type TranscodeResult,
} from '@/lib/audio/transcode-client';
import { GlassAudioPlayer } from '@/components/audio/GlassAudioPlayer';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { useMediaManager } from '@/components/media-manager/MediaManagerProvider';
import type { MediaAsset } from '@/components/media-manager/types';
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
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<AudioPlaylistSummary | null>(null);
  const [deleting, setDeleting] = useState(false);

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
    if (publishingId) return;
    setPublishingId(pl.id);
    try {
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
    } finally {
      setPublishingId(null);
    }
  };

  const confirmDeletePlaylist = async () => {
    const pl = confirmDelete;
    if (!pl || deleting) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/v1/admin/audio/playlists/${pl.id}`, { method: 'DELETE' });
      if (res.ok) {
        setPlaylists((list) => list.filter((x) => x.id !== pl.id));
        if (selectedId === pl.id) setSelectedId(null);
        setConfirmDelete(null);
      }
    } finally {
      setDeleting(false);
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

                    <button
                      type="button"
                      onClick={() => void togglePublish(pl)}
                      disabled={publishingId === pl.id}
                      title={pl.is_published ? 'החזר לטיוטה' : 'פרסם פלייליסט'}
                      className={[
                        'inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-black transition-colors disabled:opacity-60',
                        pl.is_published
                          ? 'border-emerald-300/70 bg-emerald-100/80 text-emerald-800 hover:bg-emerald-200/80'
                          : 'border-amber-300/70 bg-amber-50/90 text-amber-800 hover:bg-amber-100',
                      ].join(' ')}
                    >
                      {publishingId === pl.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : pl.is_published ? (
                        <Eye className="h-4 w-4" />
                      ) : (
                        <EyeOff className="h-4 w-4" />
                      )}
                      <span className="hidden sm:inline">
                        {pl.is_published ? 'פורסם' : 'פרסם'}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(pl)}
                      title="מחק פלייליסט"
                      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-red-200/70 bg-red-50/70 text-red-600 hover:bg-red-100"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  {active && (
                    <>
                      <div
                        className={[
                          'mt-2 flex flex-col gap-2 rounded-2xl border px-3 py-3 sm:flex-row sm:items-center sm:justify-between',
                          pl.is_published
                            ? 'border-emerald-200/70 bg-emerald-50/70'
                            : 'border-amber-200/80 bg-amber-50/80',
                        ].join(' ')}
                      >
                        <div>
                          <div className="text-sm font-black text-slate-800">
                            {pl.is_published ? 'הפלייליסט פורסם למשתמשים' : 'הפלייליסט עדיין בטיוטה'}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            פרסום הוא ברמת פלייליסט: כל הרצועות שבו זמינות בצעדים ששויכו אליו.
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => void togglePublish(pl)}
                          disabled={publishingId === pl.id}
                          className={[
                            'inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-black text-white shadow-lg disabled:opacity-60',
                            pl.is_published
                              ? 'bg-gradient-to-l from-slate-600 to-slate-500 shadow-slate-500/20'
                              : 'bg-gradient-to-l from-emerald-600 to-teal-500 shadow-emerald-500/25',
                          ].join(' ')}
                        >
                          {publishingId === pl.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : pl.is_published ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                          {pl.is_published ? 'החזר לטיוטה' : 'פרסם עכשיו'}
                        </button>
                      </div>
                      <PlaylistTrackManager
                        playlistId={pl.id}
                        onTrackAdded={() => adjustTrackCount(pl.id, 1)}
                        onTrackRemoved={() => adjustTrackCount(pl.id, -1)}
                      />
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {selected && !loading && (
        <p className="px-1 text-xs text-slate-500">
          טיפ: פתחו פלייליסט וגללו ל&quot;איפה זה מתנגן?&quot; כדי לשייך אותו לצעדים. אפשר גם דרך עורך הצעד.
        </p>
      )}

      <ConfirmDialog
        open={confirmDelete !== null}
        danger
        title="למחוק את הפלייליסט?"
        message={
          confirmDelete
            ? `"${confirmDelete.title}" וכל הרצועות שבו יימחקו לצמיתות, כולל הקבצים מ-R2. לא ניתן לשחזר.`
            : undefined
        }
        confirmLabel="מחק"
        cancelLabel="ביטול"
        busy={deleting}
        onConfirm={() => void confirmDeletePlaylist()}
        onCancel={() => !deleting && setConfirmDelete(null)}
      />
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

  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmTrack, setConfirmTrack] = useState<TrackWithUrl | null>(null);
  const [deletingTrack, setDeletingTrack] = useState(false);

  const confirmDeleteTrack = async () => {
    const track = confirmTrack;
    if (!track || deletingTrack) return;
    setDeletingTrack(true);
    try {
      const res = await fetch(`/api/v1/admin/audio/tracks/${track.id}`, { method: 'DELETE' });
      if (res.ok) {
        setTracks((t) => t.filter((x) => x.id !== track.id));
        onTrackRemoved();
        setConfirmTrack(null);
      }
    } finally {
      setDeletingTrack(false);
    }
  };

  const applyTrackUpdate = useCallback((updated: TrackWithUrl) => {
    setTracks((t) => t.map((x) => (x.id === updated.id ? { ...x, ...updated } : x)));
    setEditingId(null);
  }, []);

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
                {editingId === track.id ? (
                  <TrackEditor
                    track={track}
                    onSaved={applyTrackUpdate}
                    onCancel={() => setEditingId(null)}
                  />
                ) : (
                  <>
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
                        onClick={() => setEditingId(track.id)}
                        title="ערוך פרטים"
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-emerald-200/70 bg-emerald-50/70 text-emerald-700 hover:bg-emerald-100"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmTrack(track)}
                        title="מחק רצועה"
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-red-200/70 bg-red-50/70 text-red-600 hover:bg-red-100"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    {track.url && <GlassAudioPlayer src={track.url} />}
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <PlaylistStepAssigner playlistId={playlistId} />

      <ConfirmDialog
        open={confirmTrack !== null}
        danger
        title="למחוק את הרצועה?"
        message={
          confirmTrack
            ? `"${confirmTrack.title}" יימחק לצמיתות, כולל הקובץ מ-R2. לא ניתן לשחזר.`
            : undefined
        }
        confirmLabel="מחק"
        cancelLabel="ביטול"
        busy={deletingTrack}
        onConfirm={() => void confirmDeleteTrack()}
        onCancel={() => !deletingTrack && setConfirmTrack(null)}
      />
    </div>
  );
}

/* ============================ שיוך הפלייליסט לצעדים (איפה זה מתנגן) ============================ */

interface JourneyStepLite {
  id: string;
  title: string;
  step_number: number | null;
  audio_playlist_id: string | null;
  journey_stations?: { title?: string | null } | null;
}

function PlaylistStepAssigner({ playlistId }: { playlistId: string }) {
  const [steps, setSteps] = useState<JourneyStepLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/v1/admin/journey-steps', { credentials: 'include' });
        if (!res.ok) {
          setError(`שגיאה בטעינת הצעדים (${res.status})`);
          return;
        }
        const data = (await res.json()) as JourneyStepLite[];
        if (!cancelled) setSteps(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setError('שגיאת רשת בטעינת הצעדים');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleStep = useCallback(
    async (step: JourneyStepLite) => {
      const assignedHere = step.audio_playlist_id === playlistId;
      const nextValue = assignedHere ? null : playlistId;
      setSavingId(step.id);
      try {
        const res = await fetch('/api/v1/admin/journey-steps', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: step.id, audio_playlist_id: nextValue }),
        });
        if (res.ok) {
          setSteps((list) =>
            list.map((s) => (s.id === step.id ? { ...s, audio_playlist_id: nextValue } : s))
          );
        }
      } finally {
        setSavingId(null);
      }
    },
    [playlistId]
  );

  const assignedCount = steps.filter((s) => s.audio_playlist_id === playlistId).length;
  const filtered = query.trim()
    ? steps.filter((s) => s.title.toLowerCase().includes(query.trim().toLowerCase()))
    : steps;

  return (
    <div className="mt-4 rounded-2xl border border-sky-200/60 bg-gradient-to-br from-sky-50/70 to-white/30 p-3 backdrop-blur-xl sm:p-4">
      <div className="mb-1 flex items-center gap-2">
        <MapPin className="h-4 w-4 text-sky-600" />
        <h4 className="text-sm font-black text-slate-700">איפה זה מתנגן?</h4>
        {assignedCount > 0 && (
          <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-bold text-sky-700">
            {assignedCount} צעדים
          </span>
        )}
      </div>
      <p className="mb-3 text-[11px] text-slate-500">
        בחרו את הצעדים שבהם הפלייליסט יתנגן ברקע. צעד יכול להיות משויך לפלייליסט אחד בלבד.
      </p>

      {loading ? (
        <div className="flex items-center gap-2 py-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> טוען צעדים…
        </div>
      ) : error ? (
        <p className="flex items-center gap-2 py-1 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4" /> {error}
        </p>
      ) : steps.length === 0 ? (
        <p className="py-1 text-sm text-slate-500">אין צעדים זמינים.</p>
      ) : (
        <>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="חיפוש צעד לפי שם…"
            className="mb-2 w-full rounded-lg border border-white/70 bg-white/80 px-3 py-2 text-sm outline-none focus:border-sky-400"
          />
          <ul className="max-h-64 space-y-1.5 overflow-y-auto pe-1">
            {filtered.map((step) => {
              const assignedHere = step.audio_playlist_id === playlistId;
              const assignedElsewhere = !!step.audio_playlist_id && !assignedHere;
              return (
                <li key={step.id}>
                  <button
                    type="button"
                    onClick={() => void toggleStep(step)}
                    disabled={savingId === step.id}
                    className={[
                      'flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-right transition-colors',
                      assignedHere
                        ? 'border-sky-400/70 bg-sky-100/70'
                        : 'border-white/70 bg-white/55 hover:bg-white/80',
                    ].join(' ')}
                  >
                    <span
                      className={[
                        'flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors',
                        assignedHere ? 'border-sky-500 bg-sky-500 text-white' : 'border-slate-300 bg-white/70',
                      ].join(' ')}
                    >
                      {savingId === step.id ? (
                        <Loader2 className="h-3 w-3 animate-spin text-sky-600" />
                      ) : assignedHere ? (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      ) : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-slate-800">
                        {step.step_number != null ? `${step.step_number}. ` : ''}
                        {step.title}
                      </span>
                      {step.journey_stations?.title && (
                        <span className="block truncate text-[11px] text-slate-500">
                          {step.journey_stations.title}
                        </span>
                      )}
                    </span>
                    {assignedElsewhere && (
                      <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                        משויך לאחר
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
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

/** רישיון Suno Pro/Premier — לפי תנאי השימוש: בעלות מלאה ושימוש מסחרי, ללא חובת קרדיט. */
const SUNO_LICENSE = 'Suno Pro/Premier — בעלות מלאה ושימוש מסחרי (נוצר בזמן מנוי פעיל)';

type CreditSourceType = 'pixabay' | 'suno' | 'other';

function detectSourceType(credit: AudioCredit): CreditSourceType {
  const s = (credit.source || '').trim().toLowerCase();
  if (s === 'suno' || s.includes('suno')) return 'suno';
  if (s === 'pixabay' || s.includes('pixabay')) return 'pixabay';
  return 'other';
}

/** מחיל ברירות מחדל למקור הנבחר, מבלי לאבד מידע שהוזן ידנית. */
function applySourcePreset(credit: AudioCredit, type: CreditSourceType): AudioCredit {
  if (type === 'pixabay') {
    return { ...credit, source: 'Pixabay', license: 'Pixabay Content License' };
  }
  if (type === 'suno') {
    return { ...credit, source: 'Suno', license: SUNO_LICENSE };
  }
  // אחר — מנקים ערכים שהוגדרו אוטומטית כדי לאפשר טקסט חופשי
  const cleanedSource = credit.source === 'Pixabay' || credit.source === 'Suno' ? '' : credit.source;
  const cleanedLicense =
    credit.license === 'Pixabay Content License' || credit.license === SUNO_LICENSE ? '' : credit.license;
  return { ...credit, source: cleanedSource, license: cleanedLicense };
}

const inputCls =
  'w-full rounded-lg border border-white/60 bg-white/80 px-3 py-2 text-sm outline-none focus:border-emerald-400';

/** טופס קרדיט משותף להעלאה ולעריכה — כולל בורר מקור (Pixabay / Suno / אחר). */
function CreditFields({
  credit,
  onChange,
}: {
  credit: AudioCredit;
  onChange: (next: AudioCredit) => void;
}) {
  const sourceType = detectSourceType(credit);
  const isSuno = sourceType === 'suno';

  const sources: { id: CreditSourceType; label: string }[] = [
    { id: 'pixabay', label: 'Pixabay' },
    { id: 'suno', label: 'Suno (AI)' },
    { id: 'other', label: 'אחר' },
  ];

  return (
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <span className="mb-1 block text-xs font-bold text-slate-600">מקור התוכן</span>
        <div className="flex flex-wrap gap-1.5">
          {sources.map((s) => {
            const active = sourceType === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => onChange(applySourcePreset(credit, s.id))}
                className={[
                  'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors',
                  active
                    ? s.id === 'suno'
                      ? 'border-violet-400/70 bg-violet-100/80 text-violet-800'
                      : 'border-emerald-400/70 bg-emerald-100/80 text-emerald-800'
                    : 'border-white/70 bg-white/60 text-slate-600 hover:bg-white/90',
                ].join(' ')}
              >
                {s.id === 'suno' && <Sparkles className="h-3.5 w-3.5" />}
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      {isSuno && (
        <div className="sm:col-span-2 rounded-xl border border-violet-300/60 bg-gradient-to-br from-violet-100/70 to-fuchsia-50/40 p-3 backdrop-blur-xl">
          <div className="flex items-center gap-1.5 text-[11px] font-black text-violet-800">
            <Sparkles className="h-3.5 w-3.5" />
            תוכן שנוצר ב-Suno (מנוי Pro/Premier)
          </div>
          <ul className="mt-1.5 list-disc space-y-0.5 pe-4 text-[11px] leading-snug text-violet-900/90">
            <li>אין חובת קרדיט ל-Suno — הבעלות והשימוש המסחרי שלך (מומלץ לציין שנוצר ב-AI).</li>
            <li>הרישיון תקף רק לרצועות שנוצרו בזמן מנוי Pro/Premier פעיל.</li>
            <li>חובה להיות בעל 100% מהזכויות בחומר (ללא מילים/דגימות של אחרים).</li>
          </ul>
        </div>
      )}

      <label className="block">
        <span className="mb-1 block text-xs font-bold text-slate-600">
          {isSuno ? 'יוצר / בעל הזכויות' : 'מקור'}
        </span>
        <input
          value={credit.source}
          onChange={(e) => onChange({ ...credit, source: e.target.value })}
          className={inputCls}
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-bold text-slate-600">
          {isSuno ? 'שם האמן/הערוץ שלך' : 'יוצר / אמן'}
        </span>
        <input
          value={credit.author}
          onChange={(e) => onChange({ ...credit, author: e.target.value })}
          placeholder={isSuno ? 'השם שמופיע כיוצר' : 'שם היוצר ב-Pixabay'}
          className={inputCls}
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-bold text-slate-600">שם היצירה (אופציונלי)</span>
        <input
          value={credit.title ?? ''}
          onChange={(e) => onChange({ ...credit, title: e.target.value })}
          className={inputCls}
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-bold text-slate-600">
          {isSuno ? 'קישור לשיר ב-Suno (אופציונלי)' : 'קישור למקור (אופציונלי)'}
        </span>
        <input
          value={credit.link ?? ''}
          onChange={(e) => onChange({ ...credit, link: e.target.value })}
          placeholder={isSuno ? 'https://suno.com/song/...' : 'https://pixabay.com/...'}
          dir="ltr"
          className={inputCls}
        />
      </label>
      <label className="block sm:col-span-2">
        <span className="mb-1 block text-xs font-bold text-slate-600">רישיון (אופציונלי)</span>
        <input
          value={credit.license ?? ''}
          onChange={(e) => onChange({ ...credit, license: e.target.value })}
          className={inputCls}
        />
      </label>
    </div>
  );
}

/* ============================ עריכת פרטי רצועה ============================ */

function TrackEditor({
  track,
  onSaved,
  onCancel,
}: {
  track: TrackWithUrl;
  onSaved: (updated: TrackWithUrl) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(track.title);
  const [credit, setCredit] = useState<AudioCredit>({ ...emptyCredit, ...(track.credit ?? {}) });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (saving) return;
    if (!title.trim()) {
      setError('יש להזין שם לרצועה');
      return;
    }
    const normalized = normalizeCreditForUpload(credit);
    if (normalized.error || !normalized.credit) {
      setError(normalized.error || 'פרטי הקרדיט חסרים או לא תקינים');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/v1/admin/audio/tracks/${track.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), credit: normalized.credit }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data as { error?: string }).error || `שגיאה בשמירה (${res.status})`);
        return;
      }
      onSaved(data as TrackWithUrl);
    } catch {
      setError('שגיאת רשת בשמירה');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div dir="rtl" className="space-y-2.5">
      <div className="flex items-center gap-1.5 text-xs font-black text-emerald-800">
        <Pencil className="h-3.5 w-3.5" />
        עריכת פרטי רצועה
      </div>
      <label className="block">
        <span className="mb-1 block text-xs font-bold text-slate-600">שם הרצועה</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} />
      </label>
      <CreditFields credit={credit} onChange={setCredit} />

      {error && (
        <p className="flex items-center gap-1.5 text-xs text-red-700">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-l from-emerald-600 to-teal-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          שמור
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/70 bg-white/60 px-4 py-2 text-sm font-bold text-slate-600 hover:bg-white/90 disabled:opacity-50"
        >
          <X className="h-4 w-4" />
          ביטול
        </button>
      </div>
    </div>
  );
}

type TrackDraft = { title: string; credit: AudioCredit };

function draftStorageKey(playlistId: string): string {
  return `nura-audio-track-draft:${playlistId}`;
}

function loadDraft(playlistId: string): TrackDraft | null {
  try {
    const raw = localStorage.getItem(draftStorageKey(playlistId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<TrackDraft>;
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      title: typeof parsed.title === 'string' ? parsed.title : '',
      credit: { ...emptyCredit, ...(parsed.credit ?? {}) },
    };
  } catch {
    return null;
  }
}

function normalizeCreditForUpload(credit: AudioCredit): { credit?: AudioCredit; error?: string } {
  const source = credit.source.trim();
  const author = credit.author.trim();
  const title = credit.title?.trim() || null;
  const link = credit.link?.trim() || null;
  const license = credit.license?.trim() || null;

  if (!author || !source) {
    return { error: 'יש להזין יוצר ומקור (קרדיט) לפני העלאה' };
  }
  if (link) {
    try {
      const url = new URL(link);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return { error: 'קישור הקרדיט חייב להיות כתובת http/https תקינה' };
      }
    } catch {
      return { error: 'קישור הקרדיט לא תקין. אפשר להשאיר ריק או להזין כתובת מלאה שמתחילה ב-https://' };
    }
  }

  return {
    credit: {
      source,
      author,
      title,
      link,
      license,
    },
  };
}

function TrackUploader({ playlistId, onUploaded }: TrackUploaderProps) {
  const { open: openMediaManager } = useMediaManager();
  const inputId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [credit, setCredit] = useState<AudioCredit>(emptyCredit);
  const [dragOver, setDragOver] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'transcoding' | 'uploading'>('idle');
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ ok?: boolean; error?: string; savedPercent?: number } | null>(null);
  const [draftRestored, setDraftRestored] = useState(false);
  const draftHydrated = useRef(false);

  const busy = phase !== 'idle';

  // טעינת טיוטה שמורה (אם נכשלה העלאה קודמת / רענון דף)
  useEffect(() => {
    draftHydrated.current = false;
    const draft = loadDraft(playlistId);
    if (draft && (draft.title.trim() || draft.credit.author.trim())) {
      setTitle(draft.title);
      setCredit(draft.credit);
      setDraftRestored(true);
    } else {
      setDraftRestored(false);
    }
    draftHydrated.current = true;
  }, [playlistId]);

  // שמירת טיוטה אוטומטית בכל שינוי בשדות
  useEffect(() => {
    if (!draftHydrated.current) return;
    try {
      const hasContent = title.trim() || credit.author.trim() || credit.title?.trim() || credit.link?.trim();
      if (hasContent) {
        localStorage.setItem(draftStorageKey(playlistId), JSON.stringify({ title, credit }));
      } else {
        localStorage.removeItem(draftStorageKey(playlistId));
      }
    } catch {
      /* ignore */
    }
  }, [title, credit, playlistId]);

  const addFromLibrary = async (asset: MediaAsset) => {
    if (!asset.object_key || busy) return;
    const normalized = normalizeCreditForUpload(credit);
    if (normalized.error) {
      setResult({ error: normalized.error });
      return;
    }
    setPhase('uploading');
    setResult(null);
    try {
      const res = await fetch(
        `/api/v1/admin/audio/playlists/${playlistId}/tracks/from-library`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            source_object_key: asset.object_key,
            title: title.trim() || asset.title || 'רצועה',
            credit: normalized.credit,
            duration_seconds: asset.duration_seconds ?? null,
          }),
        }
      );
      const data = (await res.json()) as AudioTrack & { error?: string };
      if (!res.ok) {
        setResult({ error: data.error || 'הוספה מהספרייה נכשלה' });
        return;
      }
      clearDraft();
      setTitle('');
      setCredit(emptyCredit);
      setDraftRestored(false);
      onUploaded(data);
      setResult({ ok: true });
    } catch {
      setResult({ error: 'שגיאת רשת' });
    } finally {
      setPhase('idle');
    }
  };

  const clearDraft = useCallback(() => {
    try {
      localStorage.removeItem(draftStorageKey(playlistId));
    } catch {
      /* ignore */
    }
    setDraftRestored(false);
  }, [playlistId]);

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
    clearDraft();
  };

  const upload = async () => {
    if (!file || busy) return;
    if (!title.trim()) {
      setResult({ error: 'יש להזין שם לרצועה' });
      return;
    }
    const normalizedCredit = normalizeCreditForUpload(credit);
    if (normalizedCredit.error || !normalizedCredit.credit) {
      setResult({ error: normalizedCredit.error || 'פרטי הקרדיט חסרים או לא תקינים' });
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
      const metadata = {
        title: title.trim(),
        duration_seconds: Math.round(transcoded.durationSeconds),
        size_bytes: mp3.size,
        credit: normalizedCredit.credit,
      };

      setPhase('uploading');
      const presignRes = await fetch(`/api/v1/admin/audio/playlists/${playlistId}/tracks/presign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(metadata),
      });
      const presign = (await presignRes.json().catch(() => ({}))) as {
        error?: string;
        details?: { path?: string; message?: string }[];
        track_id?: string;
        object_key?: string;
        upload_url?: string;
      };
      if (!presignRes.ok || !presign.track_id || !presign.object_key || !presign.upload_url) {
        const detail = presign.details?.[0]?.path;
        setResult({
          error: detail
            ? `${presign.error || 'שגיאה בהכנת העלאה'} (${detail})`
            : presign.error || `שגיאה בהכנת העלאה (${presignRes.status})`,
        });
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
        const typed = data as { error?: string; details?: { path?: string; message?: string }[] };
        const detail = typed.details?.[0]?.path;
        setResult({
          error: detail
            ? `${typed.error || 'שגיאה בשמירת הרצועה'} (${detail})`
            : typed.error || `שגיאה בשמירת הרצועה (${completeRes.status})`,
        });
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
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h4 className="flex items-center gap-2 text-sm font-black text-slate-700">
          <Upload className="h-4 w-4 text-emerald-600" />
          העלאת רצועה
        </h4>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            openMediaManager({
              kind: 'audio',
              mode: 'pick',
              title: 'בחר אודיו מהספרייה',
              onSelect: (asset: MediaAsset) => void addFromLibrary(asset),
            })
          }
          className="rounded-xl border border-emerald-300/70 bg-emerald-800/10 px-3 py-1.5 text-xs font-bold text-emerald-900 disabled:opacity-50"
        >
          העלאת אודיו
        </button>
      </div>

      {draftRestored && (
        <div className="mb-3 flex flex-col gap-2 rounded-xl border border-amber-300/60 bg-gradient-to-br from-amber-100/70 to-amber-50/40 px-3 py-2.5 backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between">
          <span className="text-xs font-semibold leading-snug text-amber-900">
            שמרנו את הפרטים שמילאת קודם (שם וקרדיט) כדי שלא תצטרך להקליד שוב. בחר קובץ אודיו והעלה.
          </span>
          <button
            type="button"
            onClick={reset}
            title="מחיקת הפרטים השמורים והתחלה מאפס"
            className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-amber-300/70 bg-white/30 px-3 py-1.5 text-[11px] font-bold text-amber-900 backdrop-blur-md transition-colors hover:bg-white/50"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            התחל מחדש
          </button>
        </div>
      )}

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
      <div className="mt-3 space-y-2.5">
        <label className="block">
          <span className="mb-1 block text-xs font-bold text-slate-600">שם הרצועה</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} />
        </label>
        <CreditFields credit={credit} onChange={setCredit} />
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
            ? 'מעלה ל-CDN…'
            : 'דחוס והעלה'}
      </button>

      {busy && (
        <div className="mt-2.5" aria-live="polite">
          <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-slate-200/70 ring-1 ring-white/60">
            <div
              className="nura-flow-bar absolute inset-y-0 right-0 rounded-full transition-[width] duration-200 ease-out"
              style={{ width: phase === 'transcoding' ? `${progress}%` : '100%' }}
            />
            {phase === 'uploading' && (
              <div className="absolute inset-0 animate-pulse rounded-full bg-white/20" />
            )}
          </div>
          <div className="mt-1 flex items-center justify-between text-[11px] font-semibold text-slate-500">
            <span>{phase === 'transcoding' ? 'דוחס בדפדפן (איכות מרבית, משקל נמוך)' : 'מעלה ישירות ל-CDN'}</span>
            <span className="tabular-nums text-emerald-600">{phase === 'transcoding' ? `${progress}%` : '…'}</span>
          </div>
        </div>
      )}

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
