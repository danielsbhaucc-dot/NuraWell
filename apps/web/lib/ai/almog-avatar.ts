import { ALMOG_AVATAR_OBJECT_KEY } from '../storage/r2-almog';
import { avatarFallbackSvg } from '../ui/avatar-fallback-svg';

const DEFAULT_AVATAR = avatarFallbackSvg('א');

/** Placeholder when no R2 object / no public base (use in client after API fallback). */
export const ALMOG_AVATAR_FALLBACK = DEFAULT_AVATAR;

/**
 * Public CDN origin for R2 (custom domain), no trailing slash.
 * Production: https://cdn.nurawell.ai — must match the Worker / public bucket binding.
 */
export function resolveAlmogPublicBaseUrl(): string | undefined {
  const base =
    process.env.NEXT_PUBLIC_CDN_URL?.trim() ||
    process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL?.trim() ||
    process.env.R2_PUBLIC_BASE_URL?.trim();
  if (!base) return undefined;
  return base.endsWith('/') ? base.slice(0, -1) : base;
}

/**
 * Worker path segment for image bucket routing.
 * Your worker expects /images/* for image objects (and /files/* for files bucket).
 */
export function resolveCdnImagesPrefix(): string {
  const raw =
    process.env.NEXT_PUBLIC_CDN_IMAGES_PREFIX?.trim() ||
    process.env.CDN_IMAGES_PREFIX?.trim() ||
    '/images';
  const noSlashes = raw.replace(/^\/+|\/+$/g, '');
  return noSlashes ? `/${noSlashes}` : '/images';
}

/** Hostname for UI labels (e.g. cdn.nurawell.ai). */
export function almogCdnHostname(): string | null {
  const b = resolveAlmogPublicBaseUrl();
  if (!b) return null;
  try {
    return new URL(b).hostname;
  } catch {
    return null;
  }
}

/**
 * Absolute HTTPS URL to the avatar object on the CDN (R2 behind Cloudflare).
 */
export function getAlmogAvatarUrl(cacheBuster?: string): string {
  const normalized = resolveAlmogPublicBaseUrl();
  if (!normalized) return DEFAULT_AVATAR;
  const url = `${normalized}${resolveCdnImagesPrefix()}/${ALMOG_AVATAR_OBJECT_KEY}`;
  return cacheBuster ? `${url}?v=${encodeURIComponent(cacheBuster)}` : url;
}
