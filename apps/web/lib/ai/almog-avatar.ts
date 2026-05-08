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

/**
 * Public URL for Almog avatar.
 * Expected: Cloudflare R2 public/custom domain base URL + fixed object key.
 */
export function getAlmogAvatarUrl(cacheBuster?: string): string {
  const base = process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL?.trim();
  if (!base) return DEFAULT_AVATAR;
  const normalized = base.endsWith('/') ? base.slice(0, -1) : base;
  const url = `${normalized}/almog/avatar.webp`;
  return cacheBuster ? `${url}?v=${encodeURIComponent(cacheBuster)}` : url;
}

