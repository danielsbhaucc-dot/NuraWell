'use client';

import Link from 'next/link';
import type { ElementType, MouseEvent } from 'react';
import {
  BookOpen,
  ClipboardCheck,
  Route,
  Sparkles,
  TrendingUp,
  UserRound,
} from 'lucide-react';

type QuickTile = {
  href: string;
  icon: ElementType;
  label: string;
  subtitle: string;
  emoji: string;
  gradient: string;
  shadow: string;
  onClick?: (e: MouseEvent<HTMLAnchorElement>) => void;
};

interface QuickAccessGridProps {
  simplifiedDashboard?: boolean;
  onOpenTasks: () => void;
}

export function QuickAccessGrid({ simplifiedDashboard = false, onOpenTasks }: QuickAccessGridProps) {
  const tiles: QuickTile[] = [
    {
      href: '/journey',
      icon: Route,
      label: 'המסע',
      subtitle: 'צעד אחד היום',
      emoji: '🌿',
      gradient: 'linear-gradient(145deg, #047857 0%, #10b981 55%, #34d399 100%)',
      shadow: '0 10px 24px rgba(4,120,87,0.28)',
    },
    {
      href: '/plans',
      icon: Sparkles,
      label: 'התוכנית',
      subtitle: 'למה אני כאן',
      emoji: '🎯',
      gradient: 'linear-gradient(145deg, #0d9488 0%, #14b8a6 55%, #5eead4 100%)',
      shadow: '0 10px 24px rgba(13,148,136,0.28)',
    },
    {
      href: '#',
      icon: ClipboardCheck,
      label: 'משימות',
      subtitle: 'סיפרת? סמן פה',
      emoji: '✓',
      gradient: 'linear-gradient(145deg, #059669 0%, #22c55e 55%, #86efac 100%)',
      shadow: '0 10px 24px rgba(5,150,105,0.28)',
      onClick: (e) => {
        e.preventDefault();
        onOpenTasks();
      },
    },
    ...(simplifiedDashboard
      ? []
      : ([
          {
            href: '/guides',
            icon: BookOpen,
            label: 'מדריכים',
            subtitle: 'ידע בסל',
            emoji: '📚',
            gradient: 'linear-gradient(145deg, #d97706 0%, #f59e0b 55%, #fcd34d 100%)',
            shadow: '0 10px 24px rgba(217,119,6,0.28)',
          },
          {
            href: '/progress',
            icon: TrendingUp,
            label: 'התקדמות',
            subtitle: 'ראה כמה הרחקת',
            emoji: '📈',
            gradient: 'linear-gradient(145deg, #7c3aed 0%, #a855f7 55%, #d8b4fe 100%)',
            shadow: '0 10px 24px rgba(124,58,237,0.28)',
          },
          {
            href: '/profile',
            icon: UserRound,
            label: 'פרופיל',
            subtitle: 'מי אני כאן',
            emoji: '✨',
            gradient: 'linear-gradient(145deg, #db2777 0%, #ec4899 55%, #f9a8d4 100%)',
            shadow: '0 10px 24px rgba(219,39,119,0.28)',
          },
        ] as QuickTile[])),
  ];

  return (
    <div>
      <p
        style={{
          fontSize: '10px',
          fontWeight: 700,
          color: '#9896B8',
          letterSpacing: '1.2px',
          textTransform: 'uppercase',
          margin: '8px 0 10px 2px',
        }}
      >
        מבט מהיר
      </p>
      <div className={`grid gap-2.5 ${simplifiedDashboard ? 'grid-cols-2' : 'grid-cols-3'}`}>
        {tiles.map((tile) => (
          <QuickTileCard key={tile.label} tile={tile} />
        ))}
      </div>
    </div>
  );
}

function QuickTileCard({ tile }: { tile: QuickTile }) {
  const Icon = tile.icon;
  const inner = (
    <div
      className="relative flex aspect-square flex-col items-center justify-center gap-1 overflow-hidden rounded-[18px] p-2.5 transition active:scale-[0.96]"
      style={{
        background: tile.gradient,
        boxShadow: `${tile.shadow}, inset 0 1px 0 rgba(255,255,255,0.35)`,
      }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-2 top-px h-px"
        style={{
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.75), transparent)',
        }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute -left-3 -top-3 h-14 w-14 rounded-full opacity-30"
        style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.9), transparent 70%)' }}
      />
      <span className="text-[18px] leading-none" aria-hidden>
        {tile.emoji}
      </span>
      <Icon className="h-4 w-4 text-white/90" strokeWidth={2.4} aria-hidden />
      <span
        className="text-center text-[11px] font-black leading-tight text-white"
        style={{ fontFamily: "'Rubik','Heebo',sans-serif" }}
      >
        {tile.label}
      </span>
      <span className="text-center text-[9px] font-semibold leading-tight text-white/80 px-1">
        {tile.subtitle}
      </span>
    </div>
  );

  if (tile.onClick) {
    return (
      <a href={tile.href} onClick={tile.onClick} className="block no-tap-highlight">
        {inner}
      </a>
    );
  }

  return (
    <Link href={tile.href} prefetch className="block no-tap-highlight">
      {inner}
    </Link>
  );
}
