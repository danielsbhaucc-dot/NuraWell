'use client';

import { useCallback, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { buildStationCoverCredit } from '@/lib/media/stock-image-attribution';
import { StockImageSearchAttribution } from '@/components/media/StockImageAttribution';
import { glassInputClass } from './glass-styles';
import { importStockImageAsAsset } from '@/lib/media-manager/upload-client';
import type { MediaAsset } from './types';

type StockHit = {
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

type MediaStockSearchProps = {
  onImported: (asset: MediaAsset) => void;
  onError: (msg: string) => void;
};

export function MediaStockSearch({ onImported, onError }: MediaStockSearchProps) {
  const [query, setQuery] = useState('');
  const [source, setSource] = useState<'all' | 'pixabay' | 'pexels'>('all');
  const [hits, setHits] = useState<StockHit[]>([]);
  const [providers, setProviders] = useState({ pixabay: false, pexels: false });
  const [searchBusy, setSearchBusy] = useState(false);
  const [applyBusy, setApplyBusy] = useState(false);

  const runSearch = useCallback(async () => {
    const q = query.trim();
    if (!q) return;
    setSearchBusy(true);
    try {
      const params = new URLSearchParams({ q, source, per_page: '12' });
      const res = await fetch(`/api/v1/admin/stock-images/search?${params}`, { credentials: 'include' });
      const data = (await res.json()) as {
        hits?: StockHit[];
        providers?: { pixabay: boolean; pexels: boolean };
        error?: string;
      };
      if (!res.ok) {
        onError(data.error || 'חיפוש נכשל');
        setHits([]);
        return;
      }
      setHits(data.hits ?? []);
      setProviders(data.providers ?? { pixabay: false, pexels: false });
    } catch {
      onError('שגיאת רשת בחיפוש');
    } finally {
      setSearchBusy(false);
    }
  }, [onError, query, source]);

  const applyHit = async (hit: StockHit) => {
    if (applyBusy) return;
    setApplyBusy(true);
    try {
      const credit = buildStationCoverCredit({
        source: hit.source,
        photographer: hit.photographer,
        page_url: hit.page_url,
        photographer_url: hit.photographer_url,
      });
      const row = await importStockImageAsAsset({
        downloadUrl: hit.download_url,
        title: hit.alt || hit.photographer || 'תמונה',
        source: hit.source,
        credit: {
          source: hit.source,
          photographer: credit.photographer,
          page_url: credit.page_url,
          photographer_url: credit.photographer_url,
          provider_url: credit.provider_url,
          requires_attribution: true,
        },
        onProgress: () => {},
      });
      onImported(row as unknown as MediaAsset);
    } catch {
      onError('ייבוא התמונה נכשל');
    } finally {
      setApplyBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <label className="mb-1 block text-xs font-bold text-slate-700">חיפוש Pixabay / Pexels</label>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className={glassInputClass}
            placeholder="יער, מדיטציה, שקיעה…"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void runSearch();
              }
            }}
          />
        </div>
        <select
          value={source}
          onChange={(e) => setSource(e.target.value as typeof source)}
          className={`${glassInputClass} sm:w-32`}
        >
          <option value="all">הכול</option>
          <option value="pixabay">Pixabay</option>
          <option value="pexels">Pexels</option>
        </select>
        <button
          type="button"
          disabled={searchBusy || !query.trim()}
          onClick={() => void runSearch()}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-slate-900/80 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
        >
          {searchBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          חפש
        </button>
      </div>

      {hits.length > 0 ? (
        <>
          <StockImageSearchAttribution providers={providers} className="text-xs text-slate-600" />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {hits.map((hit) => (
              <button
                key={hit.id}
                type="button"
                disabled={applyBusy}
                onClick={() => void applyHit(hit)}
                className="group relative overflow-hidden rounded-xl border border-white/50 text-right disabled:opacity-60"
                style={{ background: 'rgba(255,255,255,0.18)' }}
              >
                <img src={hit.preview_url} alt="" className="aspect-[4/3] w-full object-cover" />
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
