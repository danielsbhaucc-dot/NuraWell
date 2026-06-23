'use client';

import Link from 'next/link';
import type { ElementType, MouseEvent } from 'react';
import {
  BookOpen,
  ClipboardCheck,
  FileText,
  Route,
  Settings,
  Sparkles,
  TrendingUp,
  UserRound,
} from 'lucide-react';

type QuickTile = {
  href: string;
  icon: ElementType;
  label: string;
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
      emoji: '🌿',
      gradient: 'linear-gradient(145deg, #047857 0%, #10b981 70%)',
      shadow: '0 6px 16px rgba(4,120,87,0.22)',
    },
    {
      href: '/plans',
      icon: Sparkles,
      label: 'התוכנית',
      emoji: '🎯',
      gradient: 'linear-gradient(145deg, #0d9488 0%, #14b8a6 70%)',
      shadow: '0 6px 16px rgba(13,148,136,0.22)',
    },
    {
      href: '#',
      icon: ClipboardCheck,
      label: 'משימות',
      emoji: '✓',
      gradient: 'linear-gradient(145deg, #059669 0%, #22c55e 70%)',
      shadow: '0 6px 16px rgba(5,150,105,0.22)',
      onClick: (e) => {
        e.preventDefault();
        onOpenTasks();
      },
    },
    {
      href: '/progress',
      icon: TrendingUp,
      label: 'התקדמות',
      emoji: '📈',
      gradient: 'linear-gradient(145deg, #7c3aed 0%, #a855f7 70%)',
      shadow: '0 6px 16px rgba(124,58,237,0.22)',
    },
    ...(simplifiedDashboard
      ? []
      : ([
          {
            href: '/guides',
            icon: BookOpen,
            label: 'מדריכים',
            emoji: '📚',
            gradient: 'linear-gradient(145deg, #d97706 0%, #f59e0b 70%)',
            shadow: '0 6px 16px rgba(217,119,6,0.22)',
          },
          {
            href: '/summaries',
            icon: FileText,
            label: 'סיכומים',
            emoji: '📝',
            gradient: 'linear-gradient(145deg, #2563eb 0%, #60a5fa 70%)',
            shadow: '0 6px 16px rgba(37,99,235,0.22)',
          },
          {
            href: '/profile',
            icon: UserRound,
            label: 'פרופיל',
            emoji: '✨',
            gradient: 'linear-gradient(145deg, #db2777 0%, #ec4899 70%)',
            shadow: '0 6px 16px rgba(219,39,119,0.22)',
          },
          {
            href: '/settings/almog',
            icon: Settings,
            label: 'אלמוג',
            emoji: '💚',
            gradient: 'linear-gradient(145deg, #047857 0%, #34d399 70%)',
            shadow: '0 6px 16px rgba(4,120,87,0.22)',
          },
        ] as QuickTile[])),
  ];

  const colClass = simplifiedDashboard ? 'grid-cols-4' : 'grid-cols-4';

  return (
    <div>
      <p
        style={{
          fontSize: '10px',
          fontWeight: 700,
          color: '#6b8f82',
          letterSpacing: '1.2px',
          textTransform: 'uppercase',
          margin: '8px 0 10px 2px',
        }}
      >
        מבט מהיר
      </p>
      <div className={`grid gap-2 ${colClass}`}>
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
      className="relative flex flex-col items-center justify-center gap-0.5 overflow-hidden rounded-[14px] px-1 py-2 transition active:scale-[0.96]"
      style={{
        background: tile.gradient,
        boxShadow: `${tile.shadow}, inset 0 1px 0 rgba(255,255,255,0.3)`,
        minHeight: '68px',
      }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-1 top-px h-px"
        style={{
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.65), transparent)',
        }}
      />
      <span className="text-[14px] leading-none" aria-hidden>
        {tile.emoji}
      </span>
      <Icon className="h-3.5 w-3.5 text-white/90" strokeWidth={2.4} aria-hidden />
      <span
        className="text-center text-[10px] font-black leading-tight text-white"
        style={{ fontFamily: "'Rubik','Heebo',sans-serif" }}
      >
        {tile.label}
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
