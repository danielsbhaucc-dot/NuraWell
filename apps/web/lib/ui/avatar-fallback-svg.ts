/**
 * Generates a data-URI SVG placeholder avatar with an initial letter
 * on a teal-to-emerald gradient background.
 *
 * Used by both Almog's avatar and the generic mentor avatar fallback.
 */
export function avatarFallbackSvg(initial: string): string {
  return (
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
        font-family="Rubik, Heebo, Arial" font-size="92" font-weight="700" fill="white">${initial}</text>
    </svg>`
    )
  );
}
