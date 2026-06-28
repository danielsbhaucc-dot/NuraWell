import { z } from 'zod';
import { buildStationCoverCredit, type StationCoverCredit } from './stock-image-attribution';

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

  if (useProvider === 'pixabay') {
    return fetchPixabayImage(query);
  }
  return fetchPexelsImage(query);
}
