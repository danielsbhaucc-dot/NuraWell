'use client';

import { useEffect, useState } from 'react';
import { Loader2, Save, Trash2 } from 'lucide-react';
import type { MediaAsset } from './types';
import { glassInputClass } from './glass-styles';

type MediaAssetEditPanelProps = {
  asset: MediaAsset | null;
  onSaved: (asset: MediaAsset) => void;
  onDeleted: (id: string) => void;
  onRequestDelete: () => void;
  deleteBusy?: boolean;
};

export function MediaAssetEditPanel({
  asset,
  onSaved,
  onDeleted,
  onRequestDelete,
  deleteBusy,
}: MediaAssetEditPanelProps) {
  const [title, setTitle] = useState('');
  const [altText, setAltText] = useState('');
  const [folder, setFolder] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!asset) return;
    setTitle(asset.title ?? '');
    setAltText(asset.alt_text ?? '');
    setFolder(asset.folder ?? '');
  }, [asset]);

  if (!asset) {
    return (
      <p className="text-sm text-slate-600">בחר פריט מהרשימה לעריכה או מחיקה.</p>
    );
  }

  const save = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/admin/media/${asset.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim() || asset.title,
          alt_text: altText.trim() || null,
          folder: folder.trim() || null,
        }),
      });
      const data = (await res.json()) as MediaAsset & { error?: string };
      if (!res.ok) throw new Error(data.error || 'שמירה נכשלה');
      onSaved(data);
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-xs font-bold text-slate-700">עריכה מתקדמת</p>
      <div>
        <label className="mb-1 block text-xs text-slate-600">כותרת</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} className={glassInputClass} />
      </div>
      <div>
        <label className="mb-1 block text-xs text-slate-600">טקסט חלופי</label>
        <input value={altText} onChange={(e) => setAltText(e.target.value)} className={glassInputClass} />
      </div>
      <div>
        <label className="mb-1 block text-xs text-slate-600">תיקייה</label>
        <input value={folder} onChange={(e) => setFolder(e.target.value)} className={glassInputClass} />
      </div>
      {asset.url ? (
        <p className="break-all text-[10px] text-slate-500" dir="ltr">
          {asset.url}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded-xl bg-emerald-800/85 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          שמור
        </button>
        <button
          type="button"
          onClick={onRequestDelete}
          disabled={busy || deleteBusy}
          className="inline-flex items-center gap-1 rounded-xl border border-red-300/60 bg-red-500/15 px-3 py-2 text-xs font-bold text-red-900 disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" />
          מחק
        </button>
      </div>
    </div>
  );
}

/** מחיקה אחרי אישור — מיוצא לשימוש חיצוני */
export async function deleteMediaAsset(id: string): Promise<boolean> {
  const res = await fetch(`/api/v1/admin/media/${id}`, { method: 'DELETE', credentials: 'include' });
  const data = (await res.json()) as { ok?: boolean };
  return res.ok && Boolean(data.ok);
}
