import { resolveAlmogPublicBaseUrl, resolveCdnImagesPrefix } from '../ai/almog-avatar';

/** מפתח אובייקט WebP לתמונת רקע של תחנה במסע. */
export function journeyStationCoverObjectKey(stationId: string): string {
  return `journey/stations/${stationId}.webp`;
}

/** URL ציבורי מלא לתמונה ב-CDN (Worker /images/*). */
export function getPublicCdnImageUrl(objectKey: string, cacheBuster?: string): string | null {
  const base = resolveAlmogPublicBaseUrl();
  if (!base) return null;
  const key = objectKey.replace(/^\/+/, '');
  const url = `${base}${resolveCdnImagesPrefix()}/${key}`;
  return cacheBuster ? `${url}?v=${encodeURIComponent(cacheBuster)}` : url;
}
