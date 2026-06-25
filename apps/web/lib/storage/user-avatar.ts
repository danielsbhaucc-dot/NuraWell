import { resolveAlmogPublicBaseUrl, resolveCdnImagesPrefix } from '../ai/almog-avatar';

/** מפתח אובייקט יחיד לתמונת פרופיל משתמש (WebP). */
export function userAvatarObjectKey(userId: string): string {
  const safe = userId.replace(/[^a-f0-9-]/gi, '');
  return `users/${safe}/avatar.webp`;
}

/** מפתחות ישנים לניקוי בהחלפה. */
export function userAvatarLegacyKeys(userId: string): string[] {
  const safe = userId.replace(/[^a-f0-9-]/gi, '');
  return [`users/${safe}/avatar`, `users/${safe}/avatar.jpg`, `users/${safe}/avatar.png`];
}

export function getUserAvatarCdnUrl(userId: string, cacheBuster?: string): string | null {
  const base = resolveAlmogPublicBaseUrl();
  if (!base) return null;
  const url = `${base}${resolveCdnImagesPrefix()}/${userAvatarObjectKey(userId)}`;
  return cacheBuster ? `${url}?v=${encodeURIComponent(cacheBuster)}` : url;
}
