'use client';

import { useCallback, useEffect, useState } from 'react';
import { ImageIcon, Loader2, Search, Trash2, CheckCircle2, AlertTriangle } from 'lucide-react';
import {
  encodeImageToWebpBlob,
  isWebpEncodeUnsupportedError,
} from '@/lib/client/encodeAlmogAvatarWebp';
import type { StationCoverCredit } from '@/lib/media/stock-image-attribution';
import { buildStationCoverCredit, providerLabel } from '@/lib/media/stock-image-attribution';
import { StockImageSearchAttribution } from '@/components/media/StockImageAttribution';

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

async function remoteImageToFile(url: string): Promise<File> {
  const res = await fetch(`/api/v1/admin/stock-images/proxy?url=${encodeURIComponent(url)}`, {
    credentials: 'include',
  });
  if (!res.ok) throw new Error('FETCH_FAILED');
  const blob = await res.blob();
  const type = blob.type.startsWith('image/') ? blob.type : 'image/jpeg';
  return new File([blob], 'register-bg-source', { type });
}

export function AdminRegisterBackgroundPanel() {
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [query, setQuery] = useState('wellness nature light');
  const [source, setSource] = useState<'all' | 'pixabay' | 'pexels'>('all');
  const [hits, setHits] = useState<StockHit[]>([]);
  const [providers, setProviders] = useState({ pixabay: false, pexels: false });
  const [searchBusy, setSearchBusy] = useState(false);
  const [applyBusy, setApplyBusy] = useState(false);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadCurrent = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/admin/register-background', { credentials: 'include' });
      const data = (await res.json()) as { cover_url?: string | null };
      setCoverUrl(data.cover_url ?? null);
    } catch {
      setCoverUrl(null);
    }
  }, []);

  useEffect(() => {
    void loadCurrent();
  }, [loadCurrent]);

  const runSearch = async () => {
    const q = query.trim();
    if (!q) return;
    setSearchBusy(true);
    setError(null);
    try {
      const params = new URLSearchParams({ q, source, per_page: '12' });
      const res = await fetch(`/api/v1/admin/stock-images/search?${params}`, { credentials: 'include' });
      const data = (await res.json()) as {
        hits?: StockHit[];
        providers?: { pixabay: boolean; pexels: boolean };
        error?: string;
      };
      if (!res.ok) {
        setError(data.error || 'חיפוש נכשל');
        setHits([]);
        return;
      }
      setHits(data.hits ?? []);
      setProviders(data.providers ?? { pixabay: false, pexels: false });
      if (!data.hits?.length) setError('לא נמצאו תמונות.');
    } catch {
      setError('שגיאת רשת בחיפוש.');
    } finally {
      setSearchBusy(false);
    }
  };

  const applyHit = async (hit: StockHit) => {
    setApplyBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const file = await remoteImageToFile(hit.download_url);
      const webpBlob = await encodeImageToWebpBlob(file, 1600, 0.82);
      const webpFile = new File([webpBlob], 'register-bg.webp', { type: 'image/webp' });
      const credit: StationCoverCredit = buildStationCoverCredit({
        source: hit.source,
        photographer: hit.photographer,
        page_url: hit.page_url,
        photographer_url: hit.photographer_url,
      });
      const form = new FormData();
      form.append('file', webpFile);
      form.append('credit', JSON.stringify(credit));
      form.append('original_bytes', String(file.size));
      const res = await fetch('/api/v1/admin/register-background', { method: 'POST', body: form });
      const data = (await res.json()) as { ok?: boolean; cover_url?: string; error?: string };
      if (!res.ok) {
        setError(data.error || 'העלאה נכשלה');
        return;
      }
      setCoverUrl(data.cover_url ?? null);
      setSuccess(`נשמר — קרדיט: ${providerLabel(hit.source)} / ${hit.photographer}`);
    } catch (e) {
      if (isWebpEncodeUnsupportedError(e)) {
        setError('הדפדפן לא תומך ב-WebP.');
      } else {
        setError('לא הצלחנו להעלות את התמונה.');
      }
    } finally {
      setApplyBusy(false);
    }
  };

  const removeCover = async () => {
    setRemoveBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/admin/register-background', { method: 'DELETE', credentials: 'include' });
      if (!res.ok) {
        setError('מחיקה נכשלה');
        return;
      }
      setCoverUrl(null);
      setSuccess('הרקע הוסר');
    } catch {
      setError('שגיאת רשת');
    } finally {
      setRemoveBusy(false);
    }
  };

  return (
    <section className="rounded-3xl border border-white/40 bg-white/45 p-4 sm:p-6 backdrop-blur-2xl" dir="rtl">
      <h2 className="text-lg font-black text-slate-800 mb-1 flex items-center gap-2">
        <ImageIcon className="w-5 h-5 text-emerald-500" />
        רקע עמוד הרשמה
      </h2>
      <p className="text-sm text-slate-600 mb-4">
        חיפוש ב-Pixabay או Pexels, העלאה ל-Cloudflare R2, שכבה כהה אוטומטית בדף. החלפת תמונה מוחקת את הישנה.
      </p>

      {coverUrl ? (
        <div className="relative mb-4 h-36 rounded-2xl overflow-hidden ring-1 ring-slate-200">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={coverUrl} alt="" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/40" aria-hidden />
        </div>
      ) : null}

      <div className="flex flex-col sm:flex-row gap-2 mb-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="input-field flex-1 text-sm"
          placeholder="חיפוש תמונות..."
          onKeyDown={(e) => e.key === 'Enter' && void runSearch()}
        />
        <select
          value={source}
          onChange={(e) => setSource(e.target.value as typeof source)}
          className="input-field text-sm sm:w-36"
          aria-label="מקור תמונות"
        >
          <option value="all">הכל</option>
          <option value="pixabay">Pixabay</option>
          <option value="pexels">Pexels</option>
        </select>
        <button
          type="button"
          onClick={() => void runSearch()}
          disabled={searchBusy}
          className="btn-primary text-sm px-4 py-2.5 flex items-center justify-center gap-2"
        >
          {searchBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          חפש
        </button>
      </div>

      <StockImageSearchAttribution providers={providers} className="mb-3 text-xs text-slate-500" />

      {hits.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
          {hits.map((hit) => (
            <button
              key={`${hit.source}-${hit.id}`}
              type="button"
              disabled={applyBusy}
              onClick={() => void applyHit(hit)}
              className="relative aspect-[4/3] rounded-xl overflow-hidden ring-1 ring-slate-200 hover:ring-emerald-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-500"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={hit.preview_url} alt={hit.alt || ''} className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      ) : null}

      {coverUrl ? (
        <button
          type="button"
          onClick={() => void removeCover()}
          disabled={removeBusy}
          className="text-sm text-red-700 font-bold flex items-center gap-2"
        >
          {removeBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
          הסר רקע
        </button>
      ) : null}

      {error ? (
        <p className="mt-3 text-sm text-red-800 flex gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="mt-3 text-sm text-emerald-800 flex gap-2">
          <CheckCircle2 className="w-4 h-4" />
          {success}
        </p>
      ) : null}
    </section>
  );
}
