import {
  resolveAlmogPublicBaseUrl,
  resolveCdnImagesPrefix,
} from '../ai/almog-avatar';
import { getPublicCdnImageUrl } from '../cdn/public-images';

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

function resolveAvatarCdnBase(): string {
  const fromEnv = resolveAlmogPublicBaseUrl();
  if (fromEnv) return fromEnv;
  if (typeof window !== 'undefined' && window.location.hostname.endsWith('nurawell.ai')) {
    return 'https://cdn.nurawell.ai';
  }
  return 'https://cdn.nurawell.ai';
}

export function getUserAvatarCdnUrl(userId: string, cacheBuster?: string): string {
  const base = resolveAvatarCdnBase();
  const url = `${base}${resolveCdnImagesPrefix()}/${userAvatarObjectKey(userId)}`;
  return cacheBuster ? `${url}?v=${encodeURIComponent(cacheBuster)}` : url;
}

/**
 * מתקן URL שמור ב-DB (יחסי, מפתח בלבד, או דומיין ישן) לכתובת CDN מלאה.
 */
export function normalizeStoredAvatarUrl(
  stored: string | null | undefined,
  userId: string,
  cacheBuster?: string
): string | null {
  const canonical = getUserAvatarCdnUrl(userId, cacheBuster);
  const trimmed = stored?.trim();
  if (!trimmed) return null;

  if (/^https?:\/\//i.test(trimmed)) {
    if (trimmed.includes('cdn.nurawell.ai') && trimmed.includes('/images/users/')) {
      return cacheBuster && !trimmed.includes('?v=')
        ? getUserAvatarCdnUrl(userId, cacheBuster)
        : trimmed;
    }
    return canonical ?? trimmed;
  }

  if (trimmed.startsWith('/images/') || trimmed.startsWith('images/')) {
    const base = resolveAvatarCdnBase();
    const path = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
    const url = `${base}${path}`;
    return cacheBuster ? `${url}?v=${encodeURIComponent(cacheBuster)}` : url;
  }

  if (trimmed.startsWith('users/')) {
    return getPublicCdnImageUrl(trimmed, cacheBuster) ?? canonical;
  }

  return canonical;
}
