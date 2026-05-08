import { ALMOG_AVATAR_OBJECT_KEY } from '../storage/r2-almog';

const DEFAULT_AVATAR =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#064e3b"/>
          <stop offset="100%" stop-color="#10b981"/>
        </linearGradient>
      </defs>
      <rect width="256" height="256" rx="32" fill="url(#g)"/>
      <text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle"
        font-family="Rubik, Heebo, Arial" font-size="92" font-weight="700" fill="white">א</text>
    </svg>`
  );

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
  const url = `${normalized}/${ALMOG_AVATAR_OBJECT_KEY}`;
  return cacheBuster ? `${url}?v=${encodeURIComponent(cacheBuster)}` : url;
}
