import { z } from 'zod';
import { buildStationCoverCredit, type StationCoverCredit } from './stock-image-attribution';

import crypto from 'crypto';

// מטמון פשוט בזיכרון למניעת הורדות כפולות
const imageCache = new Map<string, { buffer: Buffer; contentType: string; credit: StationCoverCredit }>();

/** מטמון מבוסס hash של תוכן התמונה למניעת העלאות כפולות ל-R2 */
const contentHashCache = new Map<string, { objectKey: string; credit: StationCoverCredit }>();

/** חישוב hash SHA-256 של Buffer */
export function computeContentHash(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/** שמירת hash במטמון */
export function cacheContentHash(
  hash: string,
  objectKey: string,
  credit: StationCoverCredit
): void {
  contentHashCache.set(hash, { objectKey, credit });
}

/** בדיקה אם hash קיים במטמון */
export function getCachedContentHash(
  hash: string
): { objectKey: string; credit: StationCoverCredit } | null {
  return contentHashCache.get(hash) ?? null;
}

const pixabayResponseSchema = z.object({
  hits: z.array(
    z.object({
      id: z.number(),
      webformatURL: z.string().url(),
      largeImageURL: z.string().url(),
      user: z.string(),
      pageURL: z.string().url(),
      userImageURL: z.string().url().optional(),
    })
  ),
});

const pexelsResponseSchema = z.object({
  photos: z.array(
    z.object({
      id: z.number(),
      src: z.object({
        original: z.string().url(),
        large2x: z.string().url(),
        medium: z.string().url(),
      }),
      photographer: z.string(),
      photographer_url: z.string().url(),
      url: z.string().url(),
    })
  ),
});

export type StockImageProvider = 'pixabay' | 'pexels';

export interface StockImageResult {
  buffer: Buffer;
  contentType: string;
  credit: StationCoverCredit;
}

async function fetchPixabayImage(query: string): Promise<StockImageResult> {
  const apiKey = process.env.PIXABAY_API_KEY?.trim();
  if (!apiKey) throw new Error('PIXABAY_API_KEY not configured');

  const url = new URL('https://pixabay.com/api/');
  url.searchParams.set('key', apiKey);
  url.searchParams.set('q', query);
  url.searchParams.set('image_type', 'photo');
  url.searchParams.set('orientation', 'horizontal');
  url.searchParams.set('per_page', '3');
  url.searchParams.set('safesearch', 'true');

  const response = await fetch(url.toString());
  if (!response.ok) throw new Error(`Pixabay API error: ${response.status}`);

  const raw = await response.json();
  const parsed = pixabayResponseSchema.parse(raw);
  if (parsed.hits.length === 0) throw new Error('No images found on Pixabay');

  const hit = parsed.hits[0];
  const imageUrl = hit.largeImageURL || hit.webformatURL;

  const imgResponse = await fetch(imageUrl);
  if (!imgResponse.ok) throw new Error(`Failed to download image: ${imgResponse.status}`);

  const buffer = Buffer.from(await imgResponse.arrayBuffer());
  const contentType = imgResponse.headers.get('content-type') || 'image/jpeg';

  const credit = buildStationCoverCredit({
    source: 'pixabay',
    photographer: hit.user,
    page_url: hit.pageURL,
    photographer_url: hit.userImageURL ?? null,
  });

  return { buffer, contentType, credit };
}

async function fetchPexelsImage(query: string): Promise<StockImageResult> {
  const apiKey = process.env.PEXELS_API_KEY?.trim();
  if (!apiKey) throw new Error('PEXELS_API_KEY not configured');

  const url = new URL('https://api.pexels.com/v1/search');
  url.searchParams.set('query', query);
  url.searchParams.set('per_page', '3');
  url.searchParams.set('orientation', 'landscape');

  const response = await fetch(url.toString(), {
    headers: { Authorization: apiKey },
  });
  if (!response.ok) throw new Error(`Pexels API error: ${response.status}`);

  const raw = await response.json();
  const parsed = pexelsResponseSchema.parse(raw);
  if (parsed.photos.length === 0) throw new Error('No images found on Pexels');

  const photo = parsed.photos[0];
  const imageUrl = photo.src.large2x || photo.src.original;

  const imgResponse = await fetch(imageUrl);
  if (!imgResponse.ok) throw new Error(`Failed to download image: ${imgResponse.status}`);

  const buffer = Buffer.from(await imgResponse.arrayBuffer());
  const contentType = imgResponse.headers.get('content-type') || 'image/jpeg';

  const credit = buildStationCoverCredit({
    source: 'pexels',
    photographer: photo.photographer,
    page_url: photo.url,
    photographer_url: photo.photographer_url,
  });

  return { buffer, contentType, credit };
}

export async function downloadStockImage(
  query: string,
  provider?: StockImageProvider
): Promise<StockImageResult> {
  const useProvider = provider ?? (process.env.PIXABAY_API_KEY ? 'pixabay' : 'pexels');
  const cacheKey = `${useProvider}:${query.toLowerCase().trim()}`;

  const cached = imageCache.get(cacheKey);
  if (cached) {
    return { ...cached };
  }

  let result: StockImageResult;
  if (useProvider === 'pixabay') {
    result = await fetchPixabayImage(query);
  } else {
    result = await fetchPexelsImage(query);
  }

  imageCache.set(cacheKey, { buffer: result.buffer, contentType: result.contentType, credit: result.credit });

  return result;
}

/** ניקוי מטמון התמונות (לשימוש בעת מחיקת מדריך) */
export function clearStockImageCache(): void {
  imageCache.clear();
}
