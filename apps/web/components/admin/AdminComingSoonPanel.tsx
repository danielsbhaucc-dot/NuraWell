'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, Music4, Sparkles, Trash2 } from 'lucide-react';
import { useMediaManager } from '@/components/media-manager/MediaManagerProvider';
import type { MediaAsset } from '@/components/media-manager/types';
import { GlassConfirmDialog } from '@/components/media-manager/GlassConfirmDialog';

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
    <section className="rounded-3xl border border-white/40 bg-white/40 p-5 backdrop-blur-xl" dir="rtl">
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-to-br from-fuchsia-500 to-violet-600 text-white shadow-md">
          <Music4 className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-lg font-black text-slate-800">שיר עמוד "בקרוב"</h2>
          <p className="text-sm text-slate-600">
            בחר את שיר ה-30 שניות (מספריית המדיה → אודיו). הוא ינוגן בעמוד עם מילות שיר מסונכרנות.
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-white/50 bg-white/35 p-4">
        {songUrl ? (
          <div className="space-y-3">
            <p className="flex items-center gap-2 text-sm font-bold text-slate-800">
              <Sparkles className="h-4 w-4 text-violet-600" />
              {songTitle || 'שיר נבחר'}
            </p>
            <audio src={songUrl} controls preload="none" className="w-full" />
          </div>
        ) : (
          <p className="text-sm text-slate-500">עדיין לא נבחר שיר.</p>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
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
          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-violet-700/90 px-4 py-2 text-sm font-bold text-white shadow-lg transition hover:bg-violet-800 disabled:opacity-50"
        >
          {applyBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Music4 className="h-4 w-4" />}
          {songUrl ? 'החלף שיר' : 'בחר שיר'}
        </button>

        <a
          href="/coming-soon"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-violet-300/60 bg-white/40 px-4 py-2 text-sm font-bold text-violet-900 transition hover:bg-white/70"
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
        <p className="mt-3 flex items-center gap-2 text-sm text-red-800">
          <AlertTriangle className="h-4 w-4" /> {error}
        </p>
      ) : null}
      {success ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-emerald-800">
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
