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

const OBJECT_KEY = 'almog/avatar';

/**
 * CDN base for Almog assets. Prefer NEXT_PUBLIC_* for static pages; R2_PUBLIC_BASE_URL is server-only fallback (exposed via /api/v1/almog-avatar).
 */
export function resolveAlmogPublicBaseUrl(): string | undefined {
  const base =
    process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL?.trim() ||
    process.env.R2_PUBLIC_BASE_URL?.trim();
  if (!base) return undefined;
  return base.endsWith('/') ? base.slice(0, -1) : base;
}

/**
 * Public URL for Almog avatar (server or when NEXT_PUBLIC base is inlined in client).
 * Client components should prefer `useAlmogAvatarUrl()` so URL works without NEXT_PUBLIC at build time.
 */
export function getAlmogAvatarUrl(cacheBuster?: string): string {
  const normalized = resolveAlmogPublicBaseUrl();
  if (!normalized) return DEFAULT_AVATAR;
  const url = `${normalized}/${OBJECT_KEY}`;
  return cacheBuster ? `${url}?v=${encodeURIComponent(cacheBuster)}` : url;
}

/** Same-origin image URL (R2 via API). Prefer in UI so the file always matches the upload bucket. */
export function almogAvatarAppImageUrl(cacheBuster: string): string {
  return `/api/v1/almog-avatar/image?v=${encodeURIComponent(cacheBuster)}`;
}

