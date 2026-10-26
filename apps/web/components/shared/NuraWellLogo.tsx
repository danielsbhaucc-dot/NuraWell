/* eslint-disable @next/next/no-img-element -- static brand SVG; next/image adds nothing for vector art */
interface NuraWellLogoProps {
  size?: 'sm' | 'md' | 'lg';
  /** Stacked logo with tagline (public/brand/nurawell-tagline*.svg). */
  showTagline?: boolean;
  /** Kept for API compatibility; the brand mark is static. */
  animate?: boolean;
  /** 'dark' = placed on a dark/forest background (default for auth + landing shells). */
  tone?: 'dark' | 'light';
  accessibleLabel?: string;
  className?: string;
}

const HEIGHT = { sm: 28, md: 36, lg: 44 } as const;
const TAGLINE_HEIGHT = { sm: 64, md: 84, lg: 104 } as const;

/** Official NuraWell logo — renders the SVG assets in public/brand. Never redraw the mark by hand. */
export function NuraWellLogo({
  size = 'sm',
  showTagline = false,
  tone = 'dark',
  accessibleLabel = 'NuraWell',
  className = '',
}: NuraWellLogoProps) {
  const suffix = tone === 'dark' ? '-on-dark' : '';
  if (showTagline) {
    const h = TAGLINE_HEIGHT[size];
    return (
      <img src={`/brand/nurawell-tagline${suffix}.svg`} alt={accessibleLabel} width={Math.round((h * 459.4) / 230)} height={h}
        className={`block h-auto select-none ${className}`} style={{ height: h, width: 'auto' }} dir="ltr" draggable={false} />
    );
  }
  const h = HEIGHT[size];
  return (
    <img src={`/brand/nurawell-special${suffix}.svg`} alt={accessibleLabel} width={Math.round((h * 458) / 90)} height={h}
      className={`block select-none ${className}`} style={{ height: h, width: 'auto' }} dir="ltr" draggable={false} />
  );
}
