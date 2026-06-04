'use client';

import { useState } from 'react';
import { ImageIcon, Loader2, Trash2, CheckCircle2, AlertTriangle, ImagePlus } from 'lucide-react';
import type { StationCoverCredit } from '@/lib/media/stock-image-attribution';
import { useMediaManager } from '@/components/media-manager/MediaManagerProvider';
import { applyStationCoverFromAsset } from '@/lib/media-manager/apply-asset';
import type { MediaAsset } from '@/components/media-manager/types';
import { GlassConfirmDialog } from '@/components/media-manager/GlassConfirmDialog';

type StationCoverState = {
  coverImageKey: string | null;
  coverImageCredit: StationCoverCredit | null;
  coverImageUrl: string | null;
};

type AdminStationCoverPanelProps = {
  stationId: string;
  stationTitle: string;
  initialCover: StationCoverState;
  onUpdated: (next: StationCoverState) => void;
};

export function AdminStationCoverPanel({
  stationId,
  stationTitle,
  initialCover,
  onUpdated,
}: AdminStationCoverPanelProps) {
  const { open } = useMediaManager();
  const [cover, setCover] = useState(initialCover);
  const [applyBusy, setApplyBusy] = useState(false);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const hasCover = Boolean(cover.coverImageUrl);

  const pickFromManager = () => {
    open({
      kind: 'image',
      mode: 'pick',
      title: `תמונת רקע — ${stationTitle}`,
      onSelect: (asset: MediaAsset) => void applyAsset(asset),
    });
  };

  const applyAsset = async (asset: MediaAsset) => {
    if (!asset.object_key || applyBusy) return;
    setApplyBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await applyStationCoverFromAsset({ stationId, asset });
      const data = (await res.json()) as {
        ok?: boolean;
        cover_url?: string | null;
        station?: { cover_image_key?: string | null; cover_image_credit?: StationCoverCredit | null };
        error?: string;
      };
      if (!res.ok || !data.ok) {
        setError(data.error || 'שמירת תמונת התחנה נכשלה');
        return;
      }
      const next: StationCoverState = {
        coverImageKey: data.station?.cover_image_key ?? asset.object_key,
        coverImageCredit: data.station?.cover_image_credit ?? null,
        coverImageUrl: data.cover_url ?? asset.url ?? null,
      };
      setCover(next);
      onUpdated(next);
      setSuccess('תמונת הרקע נשמרה ותוצג במסע.');
    } catch {
      setError('לא הצלחנו להחיל את התמונה.');
    } finally {
      setApplyBusy(false);
    }
  };

  const removeCover = async () => {
    if (removeBusy || !cover.coverImageKey) return;
    setRemoveBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch('/api/v1/admin/journey-stations/cover', {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ station_id: stationId }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error || 'הסרת תמונת הרקע נכשלה');
        return;
      }
      const next: StationCoverState = {
        coverImageKey: null,
        coverImageCredit: null,
        coverImageUrl: null,
      };
      setCover(next);
      onUpdated(next);
      setSuccess('תמונת הרקע הוסרה.');
    } catch {
      setError('שגיאת רשת בהסרת התמונה.');
    } finally {
      setRemoveBusy(false);
      setConfirmRemove(false);
    }
  };

  return (
    <>
      <CoverSummaryRow
        hasCover={hasCover}
        coverUrl={cover.coverImageUrl}
        applyBusy={applyBusy}
        onOpen={pickFromManager}
      />

      {hasCover ? (
        <div className="border-t border-white/45 bg-white/25 px-4 py-4 sm:px-5">
          <CoverPreview cover={cover} onRemove={() => setConfirmRemove(true)} removeBusy={removeBusy} />
        </div>
      ) : null}

      {error ? (
        <p className="mx-4 mb-3 inline-flex items-start gap-2 rounded-xl border border-red-200/80 bg-red-500/10 px-3 py-2 text-sm text-red-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="mx-4 mb-3 inline-flex items-center gap-2 rounded-xl border border-emerald-200/80 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-900">
          <CheckCircle2 className="h-4 w-4" />
          {success}
        </p>
      ) : null}

      <GlassConfirmDialog
        open={confirmRemove}
        title="הסרת תמונת רקע"
        message="להסיר את תמונת הרקע של התחנה?"
        confirmLabel="הסר"
        danger
        busy={removeBusy}
        onCancel={() => setConfirmRemove(false)}
        onConfirm={() => void removeCover()}
      />
    </>
  );
}

function CoverSummaryRow({
  hasCover,
  coverUrl,
  applyBusy,
  onOpen,
}: {
  hasCover: boolean;
  coverUrl: string | null;
  applyBusy: boolean;
  onOpen: () => void;
}) {
  return (
    <div className="border-t border-white/45 bg-white/25 px-4 py-4 sm:px-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-14 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/70 bg-white/30 shadow-sm backdrop-blur-sm">
            {hasCover && coverUrl ? (
              <img src={coverUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <ImageIcon className="h-5 w-5 text-slate-400" aria-hidden />
            )}
          </div>
          <div className="min-w-0 text-right">
            <p className="text-sm font-bold text-slate-800">תמונת רקע לכרטיס התחנה</p>
            <p className="mt-0.5 text-xs text-slate-500">
              {hasCover ? 'מוגדרת תמונה שתוצג במסע.' : 'לא הוגדרה תמונה — יוצג עיצוב ברירת המחדל.'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onOpen}
          disabled={applyBusy}
          className="inline-flex min-h-10 items-center justify-center gap-2 self-end rounded-xl border border-emerald-200/80 bg-white/30 px-4 py-2 text-sm font-bold text-emerald-900 shadow-sm backdrop-blur-sm transition hover:bg-white/45 sm:self-center disabled:opacity-50"
        >
          {applyBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
          {hasCover ? 'החלפת תמונה' : 'העלאת תמונה'}
        </button>
      </div>
    </div>
  );
}

function CoverPreview({
  cover,
  onRemove,
  removeBusy,
}: {
  cover: StationCoverState;
  onRemove: () => void;
  removeBusy: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-emerald-200/70 bg-slate-900/5">
      <div className="relative min-h-[120px]">
        {cover.coverImageUrl ? (
          <img src={cover.coverImageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : null}
        <div
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(180deg, rgba(6,78,59,0.55) 0%, rgba(15,23,42,0.72) 100%)',
          }}
        />
        <div className="relative z-10 flex items-end justify-end p-3">
          <button
            type="button"
            onClick={onRemove}
            disabled={removeBusy}
            className="inline-flex items-center gap-1 rounded-lg bg-white/15 px-2.5 py-1.5 text-xs font-bold text-white backdrop-blur-sm disabled:opacity-50"
          >
            {removeBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            הסר תמונה
          </button>
        </div>
      </div>
    </div>
  );
}
