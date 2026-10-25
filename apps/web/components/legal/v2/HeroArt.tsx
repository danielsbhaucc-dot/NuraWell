/** Decorative 3D-glass shield with gold rim and brand orbs (pure SVG, no network). */
export function HeroArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 460 460" className={className} aria-hidden focusable="false">
      <defs>
        <linearGradient id="ldg-gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#f6e2a8" /><stop offset=".45" stopColor="#c9a45c" /><stop offset=".7" stopColor="#fbe7b0" /><stop offset="1" stopColor="#9c7a35" /></linearGradient>
        <linearGradient id="ldg-em" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#6ee7b7" /><stop offset=".5" stopColor="#10b981" /><stop offset="1" stopColor="#0d9488" /></linearGradient>
        <linearGradient id="ldg-glass" x1="0" y1="0" x2=".3" y2="1"><stop offset="0" stopColor="#cfe9dc" stopOpacity=".85" /><stop offset=".5" stopColor="#a7f3d0" stopOpacity=".35" /><stop offset="1" stopColor="#5eead4" stopOpacity=".25" /></linearGradient>
        <radialGradient id="ldg-oe" cx=".35" cy=".3"><stop offset="0" stopColor="#ecfdf5" /><stop offset=".4" stopColor="#34d399" /><stop offset="1" stopColor="#065f46" /></radialGradient>
        <radialGradient id="ldg-oa" cx=".35" cy=".3"><stop offset="0" stopColor="#cfe9dc" /><stop offset=".4" stopColor="#fbbf24" /><stop offset="1" stopColor="#c2410c" /></radialGradient>
        <radialGradient id="ldg-ot" cx=".35" cy=".3"><stop offset="0" stopColor="#cfe9dc" /><stop offset=".45" stopColor="#2dd4bf" /><stop offset="1" stopColor="#115e59" /></radialGradient>
        <filter id="ldg-blur"><feGaussianBlur stdDeviation="14" /></filter>
        <filter id="ldg-sh"><feDropShadow dx="0" dy="18" stdDeviation="16" floodColor="#022c22" floodOpacity=".45" /></filter>
      </defs>
      <circle cx="230" cy="240" r="170" fill="url(#ldg-em)" opacity=".35" filter="url(#ldg-blur)" />
      <ellipse cx="230" cy="250" rx="200" ry="70" fill="none" stroke="url(#ldg-gold)" strokeWidth="2.5" transform="rotate(-18 230 250)" opacity=".9" />
      <circle cx="230" cy="250" r="175" fill="none" stroke="url(#ldg-gold)" strokeWidth="1" strokeDasharray="2 10" opacity=".7" />
      <g filter="url(#ldg-sh)">
        <path d="M230 70 L340 112 V210 C340 300 290 352 230 382 C170 352 120 300 120 210 V112 Z" fill="url(#ldg-glass)" stroke="url(#ldg-gold)" strokeWidth="6" strokeLinejoin="round" />
        <path d="M230 96 L318 130 V210 C318 284 278 328 230 354 C182 328 142 284 142 210 V130 Z" fill="url(#ldg-em)" opacity=".55" />
        <path d="M150 135 L230 104 L230 340 C190 316 150 280 150 210Z" fill="#eef4ea" opacity=".28" />
        <path d="M208 202 v-18 a22 22 0 0 1 44 0 v18" fill="none" stroke="url(#ldg-gold)" strokeWidth="10" />
        <rect x="196" y="200" width="68" height="58" rx="14" fill="url(#ldg-gold)" />
        <circle cx="230" cy="224" r="7" fill="#064e3b" /><rect x="227" y="226" width="6" height="18" rx="3" fill="#064e3b" />
      </g>
      <ellipse cx="190" cy="140" rx="30" ry="9" fill="#eef4ea" opacity=".7" transform="rotate(-30 190 140)" />
      <circle className="ld-orb" cx="88" cy="140" r="30" fill="url(#ldg-oa)" />
      <circle className="ld-orb ld-orb-2" cx="378" cy="320" r="38" fill="url(#ldg-ot)" />
      <circle className="ld-orb" cx="372" cy="98" r="18" fill="url(#ldg-oe)" />
      <circle cx="96" cy="350" r="14" fill="url(#ldg-gold)" />
      <path d="M60 250 l6 -14 l6 14 l14 6 l-14 6 l-6 14 l-6 -14 l-14 -6z" fill="url(#ldg-gold)" />
      <path d="M400 200 l4 -10 l4 10 l10 4 l-10 4 l-4 10 l-4 -10 l-10 -4z" fill="url(#ldg-gold)" />
    </svg>
  );
}
