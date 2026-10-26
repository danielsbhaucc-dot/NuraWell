'use client';

import {
  BookOpen,
  Folder,
  ImageIcon,
  Map,
  Mic,
  Music,
  FileText,
  Film,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatHebrewRelativeTimeSmart } from '@/lib/date/he-relative-time';
import type { SmartFolderCategory } from '@/lib/media-manager/smart-folders';
import type { FinderFolderEntry } from '@/lib/media-manager/smart-folders';

type FinderFolderCardProps = {
  folder: FinderFolderEntry;
  onOpen: () => void;
  variant?: 'category' | 'subfolder';
};

function folderAccent(icon?: SmartFolderCategory['icon']): {
  tab: string;
  body: string;
  glow: string;
} {
  switch (icon) {
    case 'tts':
      return {
        tab: 'from-iris-300 to-iris-400',
        body: 'from-iris-400 via-iris-500 to-iris-600',
        glow: 'shadow-iris-900/25',
      };
    case 'journey':
      return {
        tab: 'from-coral-300 to-coral-400',
        body: 'from-coral-400 via-coral-500 to-coral-600',
        glow: 'shadow-coral-900/25',
      };
    case 'guides':
      return {
        tab: 'from-accent-300 to-accent-400',
        body: 'from-accent-400 via-accent-500 to-energy-600',
        glow: 'shadow-accent-900/25',
      };
    case 'audio':
      return {
        tab: 'from-secondary-300 to-secondary-400',
        body: 'from-secondary-400 via-secondary-500 to-secondary-600',
        glow: 'shadow-secondary-900/25',
      };
    case 'video':
      return {
        tab: 'from-iris-300 to-iris-400',
        body: 'from-iris-400 via-iris-500 to-iris-600',
        glow: 'shadow-iris-900/25',
      };
    case 'files':
      return {
        tab: 'from-ink-300 to-ink-400',
        body: 'from-ink-400 via-ink-500 to-ink-700',
        glow: 'shadow-ink-900/25',
      };
    default:
      return {
        tab: 'from-primary-300 to-primary-400',
        body: 'from-primary-400 via-primary-500 to-secondary-600',
        glow: 'shadow-primary-900/25',
      };
  }
}

function folderTypeIcon(icon?: SmartFolderCategory['icon']) {
  if (icon === 'tts') return Mic;
  if (icon === 'guides') return BookOpen;
  if (icon === 'journey') return Map;
  if (icon === 'images') return ImageIcon;
  if (icon === 'audio') return Music;
  if (icon === 'files') return FileText;
  if (icon === 'video') return Film;
  return Folder;
}

export function FinderFolderCard({ folder, onOpen, variant = 'subfolder' }: FinderFolderCardProps) {
  const accent = folderAccent(folder.icon);
  const TypeIcon = folderTypeIcon(folder.icon);

  return (
    <button
      type="button"
      onClick={onOpen}
      onDoubleClick={onOpen}
      className={cn(
        'group flex w-full flex-col items-center gap-2 rounded-2xl p-3 text-center transition',
        'hover:bg-background-card/30 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary-400/50',
        variant === 'category' ? 'min-h-38' : 'min-h-34'
      )}
    >
      <div className="relative">
        <div
          className={cn(
            'relative h-[3.4rem] w-[4.6rem] transition-transform duration-200 group-hover:scale-[1.04] group-active:scale-[0.98]',
            variant === 'category' && 'h-[3.8rem] w-20'
          )}
        >
          <div
            className={cn(
              'absolute top-0 inset-s-[0.85rem] h-[0.62rem] w-[2.1rem] rounded-t-[5px] bg-linear-to-b',
              accent.tab,
              variant === 'category' && 'inset-s-[0.95rem] h-[0.7rem] w-[2.35rem]'
            )}
            aria-hidden
          />
          <div
            className={cn(
              'absolute inset-x-0 bottom-0 top-[0.45rem] rounded-[10px] rounded-ss-[4px] bg-linear-to-br shadow-lg',
              accent.body,
              accent.glow,
              variant === 'category' && 'top-2 rounded-[11px]'
            )}
            aria-hidden
          />
          <div
            className="pointer-events-none absolute inset-x-[0.35rem] top-[0.7rem] bottom-[0.35rem] rounded-[7px] bg-linear-to-br from-background-card/40 via-background-card/10 to-transparent"
            aria-hidden
          />
          <div className="absolute inset-0 flex items-center justify-center pt-2">
            <TypeIcon className="h-5 w-5 text-on-dark/90 drop-shadow-xs" aria-hidden />
          </div>
        </div>
        <span className="absolute -top-1 -inset-e-1 min-w-[1.35rem] rounded-full bg-ink-900/80 px-1.5 py-0.5 text-[10px] font-bold text-on-dark shadow-xs">
          {folder.count}
        </span>
      </div>

      <span className="line-clamp-2 w-full px-1 text-xs font-bold leading-tight text-ink-800">
        {folder.label}
      </span>
      {folder.latestTs > 0 ? (
        <span className="text-[10px] text-ink-500">
          עודכן {formatHebrewRelativeTimeSmart(folder.latestTs)}
        </span>
      ) : null}
    </button>
  );
}
