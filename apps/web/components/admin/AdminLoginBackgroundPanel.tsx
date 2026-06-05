'use client';

import { useCallback, useEffect, useState } from 'react';
import { ImageIcon, Loader2, Trash2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useMediaManager } from '@/components/media-manager/MediaManagerProvider';
import { applyLoginBackgroundFromAsset } from '@/lib/media-manager/apply-asset';
import type { MediaAsset } from '@/components/media-manager/types';
import { GlassConfirmDialog } from '@/components/media-manager/GlassConfirmDialog';

export function AdminLoginBackgroundPanel() {
  const { open } = useMediaManager();
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [applyBusy, setApplyBusy] = useState(false);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const loadCurrent = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/admin/login-background', { credentials: 'include' });
      const data = (await res.json()) as { cover_url?: string | null };
      setCoverUrl(data.cover_url ?? null);
    } catch {
      setCoverUrl(null);
    }
  }, []);

  useEffect(() => {
    void loadCurrent();
  }, [loadCurrent]);

  const applyAsset = async (asset: MediaAsset) => {
    if (!asset.object_key || applyBusy) return;
    setApplyBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await applyLoginBackgroundFromAsset(asset);
      const data = (await res.json()) as { ok?: boolean; cover_url?: string; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error || 'שמירה נכשלה');
        return;
      }
      setCoverUrl(data.cover_url ?? asset.url ?? null);
      setSuccess('רקע ההתחברות עודכן.');
    } catch {
      setError('שגיאת רשת');
    } finally {
      setApplyBusy(false);
    }
  };

  const remove = async () => {
    setRemoveBusy(true);
    try {
      const res = await fetch('/api/v1/admin/login-background', { method: 'DELETE', credentials: 'include' });
      if (!res.ok) {
        setError('הסרה נכשלה');
        return;
      }
      setCoverUrl(null);
      setSuccess('רקע ההתחברות הוסר.');
    } catch {
      setError('שגיאת רשת');
    } finally {
      setRemoveBusy(false);
      setConfirmRemove(false);
    }
  };

  return (
    <section className="rounded-3xl border border-white/50 bg-white/45 p-4 backdrop-blur-xl sm:p-5" dir="rtl">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-cyan-600 text-white shadow-md shadow-sky-600/25">
          <ImageIcon className="h-5 w-5" aria-hidden />
        </span>
        <div>
          <h2 className="font-display text-lg font-black text-slate-800">רקע דף התחברות</h2>
          <p className="text-sm text-slate-600">בחר תמונה ממנהל הקבצים (העלאה, Pixabay, Pexels).</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="h-20 w-32 overflow-hidden rounded-xl border border-white/60 bg-white/25">
          {coverUrl ? (
            <img src={coverUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center">
              <ImageIcon className="h-6 w-6 text-slate-400" />
            </div>
          )}
        </div>
        <button
          type="button"
          disabled={applyBusy}
          onClick={() =>
            open({
              kind: 'image',
              mode: 'pick',
              title: 'רקע התחברות',
              onSelect: (a) => void applyAsset(a),
            })
          }
          className="rounded-xl bg-emerald-800/85 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
        >
          {applyBusy ? <Loader2 className="inline h-4 w-4 animate-spin" /> : null} העלאת תמונה
        </button>
        {coverUrl ? (
          <button
            type="button"
            onClick={() => setConfirmRemove(true)}
            className="rounded-xl border border-red-300/60 bg-red-500/10 px-3 py-2 text-sm font-bold text-red-900"
          >
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
        title="הסרת רקע"
        message="להסיר את רקע דף ההתחברות?"
        danger
        busy={removeBusy}
        onCancel={() => setConfirmRemove(false)}
        onConfirm={() => void remove()}
      />
    </section>
  );
}
