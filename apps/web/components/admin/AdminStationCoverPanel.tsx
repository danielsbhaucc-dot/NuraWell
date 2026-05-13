'use client';

import { useCallback, useState } from 'react';
import { ImageIcon, Loader2, Search, Trash2, CheckCircle2, AlertTriangle } from 'lucide-react';
import {
  encodeImageToWebpBlob,
  isWebpEncodeUnsupportedError,
} from '@/lib/client/encodeAlmogAvatarWebp';
import type { StationCoverCredit } from '@/lib/media/stock-image-attribution';
import { buildStationCoverCredit } from '@/lib/media/stock-image-attribution';
import {
  StockImageAttribution,
  StockImageSearchAttribution,
} from '@/components/media/StockImageAttribution';

type StockImageHit = {
  id: string;
  source: 'pixabay' | 'pexels';
  preview_url: string;
  download_url: string;
  photographer: string;
  page_url: string;
  photographer_url?: string;
  provider_url: string;
  alt?: string;
};

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

async function remoteImageToFile(url: string): Promise<File> {
  const res = await fetch(`/api/v1/admin/stock-images/proxy?url=${encodeURIComponent(url)}`, {
    credentials: 'include',
  });
  if (!res.ok) throw new Error('FETCH_FAILED');
  const blob = await res.blob();
  const type = blob.type.startsWith('image/') ? blob.type : 'image/jpeg';
  return new File([blob], 'station-cover-source', { type });
}

export function AdminStationCoverPanel({
  stationId,
  stationTitle,
  initialCover,
  onUpdated,
}: AdminStationCoverPanelProps) {
  const [cover, setCover] = useState(initialCover);
  const [query, setQuery] = useState(stationTitle);
  const [source, setSource] = useState<'all' | 'pixabay' | 'pexels'>('all');
  const [hits, setHits] = useState<StockImageHit[]>([]);
  const [providers, setProviders] = useState<{ pixabay: boolean; pexels: boolean }>({
    pixabay: false,
    pexels: false,
  });
  const [searchBusy, setSearchBusy] = useState(false);
  const [applyBusy, setApplyBusy] = useState(false);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const runSearch = useCallback(async () => {
    const q = query.trim();
    if (!q) return;
    setSearchBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const params = new URLSearchParams({ q, source, per_page: '12' });
      const res = await fetch(`/api/v1/admin/stock-images/search?${params.toString()}`, {
        credentials: 'include',
      });
      const data = (await res.json()) as {
        hits?: StockImageHit[];
        providers?: { pixabay: boolean; pexels: boolean };
        error?: string;
      };
      if (!res.ok) {
        setError(data.error || 'חיפוש תמונות נכשל');
        setHits([]);
        setProviders({ pixabay: false, pexels: false });
        return;
      }
      setHits(data.hits ?? []);
      setProviders(data.providers ?? { pixabay: false, pexels: false });
      if (!data.hits?.length) {
        setError('לא נמצאו תמונות לחיפוש הזה.');
      }
    } catch {
      setError('שגיאת רשת בחיפוש תמונות.');
    } finally {
      setSearchBusy(false);
    }
  }, [query, source]);

  const applyHit = async (hit: StockImageHit) => {
    if (applyBusy) return;
    setApplyBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const sourceFile = await remoteImageToFile(hit.download_url);
      const originalSize = sourceFile.size;
      let webpBlob: Blob;
      try {
        webpBlob = await encodeImageToWebpBlob(sourceFile, 1280, 0.82);
      } catch (e) {
        if (isWebpEncodeUnsupportedError(e)) {
          setError('הדפדפן לא יודע לייצא WebP. נסה מכרום או אדג׳ מעודכן.');
          return;
        }
        setError('לא הצלחנו להכין את התמונה במכשיר.');
        return;
      }

      const credit = buildStationCoverCredit({
        source: hit.source,
        photographer: hit.photographer,
        page_url: hit.page_url,
        photographer_url: hit.photographer_url,
      });

      const form = new FormData();
      form.append('file', new File([webpBlob], 'station-cover.webp', { type: 'image/webp' }));
      form.append('station_id', stationId);
      form.append('credit', JSON.stringify(credit));
      form.append('original_bytes', String(originalSize));

      const res = await fetch('/api/v1/admin/journey-stations/cover', {
        method: 'POST',
        credentials: 'include',
        body: form,
      });
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
        coverImageKey: data.station?.cover_image_key ?? null,
        coverImageCredit: data.station?.cover_image_credit ?? credit,
        coverImageUrl: data.cover_url ?? null,
      };
      setCover(next);
      onUpdated(next);
      setSuccess('תמונת הרקע נשמרה ב-R2 ותוצג במסע.');
    } catch {
      setError('לא הצלחנו להוריד או להעלות את התמונה.');
    } finally {
      setApplyBusy(false);
    }
  };

  const removeCover = async () => {
    if (removeBusy || !cover.coverImageKey) return;
    if (!confirm('להסיר את תמונת הרקע של התחנה?')) return;
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
    }
  };

  return (
    <div className="border-t border-white/50 bg-white/35 px-4 py-4 sm:px-5">
      <PanelHeader stationTitle={stationTitle} hasCover={Boolean(cover.coverImageUrl)} />

      {cover.coverImageUrl ? (
        <CoverPreview cover={cover} onRemove={() => void removeCover()} removeBusy={removeBusy} />
      ) : null}

      <div className="mt-4 flex flex-col gap-3">
        <SearchForm
          query={query}
          source={source}
          searchBusy={searchBusy}
          onQueryChange={setQuery}
          onSourceChange={setSource}
          onSearch={() => void runSearch()}
        />

        {hits.length > 0 ? (
          <>
            <StockImageSearchAttribution
              providers={providers}
              className="text-xs leading-relaxed text-slate-600"
            />
            <ResultsGrid hits={hits} applyBusy={applyBusy} onApply={(hit) => void applyHit(hit)} />
          </>
        ) : null}
      </div>

      {error ? (
        <p className="mt-3 inline-flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="mt-3 inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          <CheckCircle2 className="h-4 w-4" />
          {success}
        </p>
      ) : null}
    </div>
  );
}

function PanelHeader({ stationTitle, hasCover }: { stationTitle: string; hasCover: boolean }) {
  return (
    <div className="min-w-0 text-right">
      <p className="inline-flex items-center gap-2 text-sm font-black text-slate-800">
        <ImageIcon className="h-4 w-4 text-emerald-600" />
        תמונת רקע לתחנה
      </p>
      <p className="mt-1 text-xs leading-relaxed text-slate-600">
        {hasCover
          ? `לתחנה "${stationTitle}" מוגדרת תמונה שתוצג בכרטיס התחנה במסע.`
          : `בחרו תמונה מ-Pixabay או Pexels לתחנה "${stationTitle}". ללא תמונה — הכרטיס נשאר בעיצוב ברירת המחדל.`}
      </p>
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
    <div className="mt-3 overflow-hidden rounded-2xl border border-emerald-200/70 bg-slate-900/5">
      <motionlessPreviewInner cover={cover} onRemove={onRemove} removeBusy={removeBusy} />
    </div>
  );
}

function motionlessPreviewInner({
  cover,
  onRemove,
  removeBusy,
}: {
  cover: StationCoverState;
  onRemove: () => void;
  removeBusy: boolean;
}) {
  return (
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
      <div className="relative z-10 flex items-end justify-between gap-3 p-3">
        <button
          type="button"
          onClick={onRemove}
          disabled={removeBusy}
          className="inline-flex items-center gap-1 rounded-lg bg-white/15 px-2.5 py-1.5 text-xs font-bold text-white backdrop-blur-sm disabled:opacity-50"
        >
          {removeBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
          הסר
        </button>
        {cover.coverImageCredit ? (
          <StockImageAttribution
            credit={cover.coverImageCredit}
            variant="admin"
            className="text-[10px] leading-snug text-white/80"
          />
        ) : null}
      </div>
    </div>
  );
}

function SearchForm({
  query,
  source,
  searchBusy,
  onQueryChange,
  onSourceChange,
  onSearch,
}: {
  query: string;
  source: 'all' | 'pixabay' | 'pexels';
  searchBusy: boolean;
  onQueryChange: (value: string) => void;
  onSourceChange: (value: 'all' | 'pixabay' | 'pexels') => void;
  onSearch: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <div className="min-w-0 flex-1">
        <label className="mb-1 block text-xs font-bold text-slate-700">חיפוש תמונה (Pixabay / Pexels)</label>
        <input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          className="w-full rounded-xl border border-white/80 bg-white/90 px-4 py-2.5 text-slate-900 outline-none focus:ring-2 focus:ring-emerald-400/50"
          placeholder="למשל: יער, שקיעה, מדיטציה"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onSearch();
            }
          }}
        />
      </div>
      <div className="w-full sm:w-36">
        <label className="mb-1 block text-xs font-bold text-slate-700">מקור</label>
        <select
          value={source}
          onChange={(e) => onSourceChange(e.target.value as 'all' | 'pixabay' | 'pexels')}
          className="w-full rounded-xl border border-white/80 bg-white/90 px-3 py-2.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-emerald-400/50"
        >
          <option value="all">הכול</option>
          <option value="pixabay">Pixabay</option>
          <option value="pexels">Pexels</option>
        </select>
      </div>
      <button
        type="button"
        onClick={onSearch}
        disabled={searchBusy || !query.trim()}
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
      >
        {searchBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
        חפש
      </button>
    </div>
  );
}

function ResultsGrid({
  hits,
  applyBusy,
  onApply,
}: {
  hits: StockImageHit[];
  applyBusy: boolean;
  onApply: (hit: StockImageHit) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
      {hits.map((hit) => (
        <button
          key={hit.id}
          type="button"
          disabled={applyBusy}
          onClick={() => onApply(hit)}
          className="group relative overflow-hidden rounded-xl border border-white/70 bg-white/80 text-right shadow-sm transition hover:ring-2 hover:ring-emerald-400/70 disabled:opacity-60"
        >
          <img src={hit.preview_url} alt={hit.alt || ''} className="aspect-[4/3] w-full object-cover" />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-2">
            <StockImageAttribution
              credit={buildStationCoverCredit({
                source: hit.source,
                photographer: hit.photographer,
                page_url: hit.page_url,
                photographer_url: hit.photographer_url,
              })}
              variant="public"
              className="line-clamp-2 text-[10px] font-semibold text-white/90"
            />
          </div>
        </button>
      ))}
    </div>
  );
}
