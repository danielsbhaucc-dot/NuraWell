'use client';

interface NuraWellLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showTagline?: boolean;
  animate?: boolean;
}

export function NuraWellLogo({ size = 'sm', showTagline = false, animate = true }: NuraWellLogoProps) {
  const iconSize = size === 'sm' ? 32 : size === 'md' ? 44 : 60;
  const fontSizeMain = size === 'sm' ? 24 : size === 'md' ? 34 : 46;
  const fontSizeAi = size === 'sm' ? 10 : size === 'md' ? 12 : 14;

  return (
    <div className="flex items-center gap-2.5 select-none" dir="ltr">
      {/* Heart + Heartbeat Icon */}
      <div className="relative flex-shrink-0" style={{ width: iconSize, height: Math.round(iconSize * 0.85) }}>
        {/* Glow */}
        {animate && (
          <div
            className="absolute inset-0 rounded-full pointer-events-none"
            style={{
              background: 'radial-gradient(ellipse, rgba(20,255,236,0.18) 0%, transparent 70%)',
              animation: 'glowPulse 3s ease-in-out infinite',
              inset: '-8px',
            }}
          />
        )}
        <svg
          width={iconSize}
          height={Math.round(iconSize * 0.85)}
          viewBox="0 0 72 60"
          fill="none"
          aria-hidden="true"
        >
          {/* Heart fill */}
          <path
            d="M36 52C36 52 8 34 8 18C8 10 14 4 22 4C27 4 31.5 6.5 36 11C40.5 6.5 45 4 50 4C58 4 64 10 64 18C64 34 36 52 36 52Z"
            fill="url(#hfLogo)"
            opacity="0.18"
          />
          {/* Heart outline */}
          <path
            d="M36 52C36 52 8 34 8 18C8 10 14 4 22 4C27 4 31.5 6.5 36 11C40.5 6.5 45 4 50 4C58 4 64 10 64 18C64 34 36 52 36 52Z"
            stroke="url(#hsLogo)"
            strokeWidth="1.5"
            fill="none"
          />
          {/* Heartbeat line */}
          <polyline
            points="2,30 12,30 17,16 22,44 28,24 34,30 38,30 44,10 50,38 56,30 70,30"
            stroke="#14FFEC"
            strokeWidth="2.2"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={animate ? { animation: 'beat 1.6s ease-in-out infinite' } : {}}
          />
          <defs>
            <linearGradient id="hfLogo" x1="36" y1="4" x2="36" y2="52" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#14FFEC" />
              <stop offset="100%" stopColor="#0D7377" />
            </linearGradient>
            <linearGradient id="hsLogo" x1="36" y1="4" x2="36" y2="52" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#14FFEC" />
              <stop offset="100%" stopColor="rgba(13,115,119,0.5)" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      {/* Wordmark */}
      <div className="flex flex-col leading-none">
        <div className="flex items-baseline">
          <span
            style={{
              fontFamily: "'Cormorant Garamond', 'Georgia', serif",
              fontWeight: 600,
              fontSize: fontSizeMain,
              color: '#ffffff',
              letterSpacing: '-0.5px',
              lineHeight: 1,
            }}
          >
            Nura
          </span>
          <span
            style={{
              fontFamily: "'Cormorant Garamond', 'Georgia', serif",
              fontWeight: 300,
              fontSize: fontSizeMain,
              color: '#14FFEC',
              lineHeight: 1,
            }}
          >
            well
          </span>
          <span
            style={{
              fontFamily: "'DM Sans', 'Heebo', sans-serif",
              fontWeight: 300,
              fontSize: fontSizeAi,
              color: 'rgba(20,255,236,0.45)',
              marginLeft: 2,
              alignSelf: 'flex-start',
              marginTop: size === 'sm' ? 3 : 5,
            }}
          >
            .ai
          </span>
        </div>
        {showTagline && (
          <span
            style={{
              fontFamily: "'DM Sans', 'Heebo', sans-serif",
              fontWeight: 300,
              fontSize: 9,
              letterSpacing: '3px',
              textTransform: 'uppercase' as const,
              color: 'rgba(255,255,255,0.2)',
              marginTop: 4,
            }}
          >
            Your light · Your way
          </span>
        )}
      </div>
    </div>
  );
}
