import { resolveAlmogPublicBaseUrl } from '../ai/almog-avatar';

/**
 * נתיב ה-Worker לאודיו. ה-Worker מנתב /audio/* אל דלי ה-AUDIO.
 * ניתן לעקוף עם NEXT_PUBLIC_CDN_AUDIO_PREFIX / CDN_AUDIO_PREFIX.
 */
export function resolveCdnAudioPrefix(): string {
  const raw =
    process.env.NEXT_PUBLIC_CDN_AUDIO_PREFIX?.trim() ||
    process.env.CDN_AUDIO_PREFIX?.trim() ||
    '/audio';
  const noSlashes = raw.replace(/^\/+|\/+$/g, '');
  return noSlashes ? `/${noSlashes}` : '/audio';
}

/** מפתח אובייקט לרצועת אודיו (תמיד MP3 לאחר דחיסה בדפדפן). */
export function audioTrackObjectKey(playlistId: string, trackId: string): string {
  return `playlists/${playlistId}/${trackId}.mp3`;
}

/** URL ציבורי מלא לרצועת אודיו ב-CDN (Worker /audio/*). */
export function getPublicCdnAudioUrl(objectKey: string, cacheBuster?: string): string | null {
  const base = resolveAlmogPublicBaseUrl();
  if (!base) return null;
  const key = objectKey.replace(/^\/+/, '');
  const url = `${base}${resolveCdnAudioPrefix()}/${key}`;
  return cacheBuster ? `${url}?v=${encodeURIComponent(cacheBuster)}` : url;
}
