import { z } from 'zod';
import { buildStationCoverCredit } from './stock-image-attribution';

export const stockImageHitSchema = z.object({
  id: z.string(),
  source: z.enum(['pixabay', 'pexels']),
  preview_url: z.string().url(),
  download_url: z.string().url(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  photographer: z.string(),
  page_url: z.string().url(),
  photographer_url: z.string().url().optional(),
  provider_url: z.string().url(),
  alt: z.string().optional(),
});

export type StockImageHit = z.infer<typeof stockImageHitSchema>;

export const stockImageSearchQuerySchema = z.object({
  q: z.string().trim().min(1).max(100),
  source: z.enum(['all', 'pixabay', 'pexels']).optional().default('all'),
  per_page: z.coerce.number().int().min(3).max(24).optional().default(12),
});

type PixabayHit = {
  id: number;
  pageURL: string;
  largeImageURL: string;
  webformatURL: string;
  imageWidth: number;
  imageHeight: number;
  user: string;
  user_id: number;
  tags?: string;
};

type PexelsPhoto = {
  id: number;
  alt?: string;
  photographer: string;
  photographer_url: string;
  url: string;
  src: {
    large: string;
    large2x?: string;
    original?: string;
  };
  width: number;
  height: number;
};

async function searchPixabay(query: string, perPage: number): Promise<StockImageHit[]> {
  const key = process.env.PIXABAY_API_KEY?.trim();
  if (!key) return [];

  const url = new URL('https://pixabay.com/api/');
  url.searchParams.set('key', key);
  url.searchParams.set('q', query);
  url.searchParams.set('image_type', 'photo');
  url.searchParams.set('orientation', 'horizontal');
  url.searchParams.set('safesearch', 'true');
  url.searchParams.set('per_page', String(perPage));

  const res = await fetch(url.toString(), { next: { revalidate: 86400 } });
  if (!res.ok) return [];

  const data = (await res.json()) as { hits?: PixabayHit[] };
  return (data.hits ?? []).map((hit) => {
    const credit = buildStationCoverCredit({
      source: 'pixabay',
      photographer: hit.user,
      page_url: hit.pageURL,
      photographer_url: `https://pixabay.com/users/${encodeURIComponent(hit.user)}-${hit.user_id}/`,
    });
    return {
      id: `pixabay-${hit.id}`,
      source: 'pixabay' as const,
      preview_url: hit.webformatURL,
      download_url: hit.largeImageURL || hit.webformatURL,
      width: hit.imageWidth,
      height: hit.imageHeight,
      photographer: hit.user,
      page_url: hit.pageURL,
      photographer_url: credit.photographer_url,
      provider_url: credit.provider_url,
      alt: hit.tags,
    };
  });
}

async function searchPexels(query: string, perPage: number): Promise<StockImageHit[]> {
  const key = process.env.PEXELS_API_KEY?.trim();
  if (!key) return [];

  const url = new URL('https://api.pexels.com/v1/search');
  url.searchParams.set('query', query);
  url.searchParams.set('per_page', String(perPage));
  url.searchParams.set('orientation', 'landscape');

  const res = await fetch(url.toString(), {
    headers: { Authorization: key },
    next: { revalidate: 86400 },
  });
  if (!res.ok) return [];

  const data = (await res.json()) as { photos?: PexelsPhoto[] };
  return (data.photos ?? []).map((photo) => {
    const credit = buildStationCoverCredit({
      source: 'pexels',
      photographer: photo.photographer,
      page_url: photo.url,
      photographer_url: photo.photographer_url,
    });
    return {
      id: `pexels-${photo.id}`,
      source: 'pexels' as const,
      preview_url: photo.src.large,
      download_url: photo.src.large2x || photo.src.large || photo.src.original || photo.src.large,
      width: photo.width,
      height: photo.height,
      photographer: photo.photographer,
      page_url: photo.url,
      photographer_url: credit.photographer_url,
      provider_url: credit.provider_url,
      alt: photo.alt,
    };
  });
}

export async function searchStockImages(params: {
  q: string;
  source: 'all' | 'pixabay' | 'pexels';
  perPage: number;
}): Promise<{ hits: StockImageHit[]; providers: { pixabay: boolean; pexels: boolean } }> {
  const perPage = params.perPage;
  const half = Math.max(1, Math.ceil(perPage / 2));

  if (params.source === 'pixabay') {
    const hits = await searchPixabay(params.q, perPage);
    return { hits, providers: { pixabay: Boolean(process.env.PIXABAY_API_KEY?.trim()), pexels: false } };
  }

  if (params.source === 'pexels') {
    const hits = await searchPexels(params.q, perPage);
    return { hits, providers: { pixabay: false, pexels: Boolean(process.env.PEXELS_API_KEY?.trim()) } };
  }

  const [pixabay, pexels] = await Promise.all([searchPixabay(params.q, half), searchPexels(params.q, half)]);
  const merged = [...pixabay, ...pexels].slice(0, perPage);
  return {
    hits: merged,
    providers: {
      pixabay: Boolean(process.env.PIXABAY_API_KEY?.trim()),
      pexels: Boolean(process.env.PEXELS_API_KEY?.trim()),
    },
  };
}
