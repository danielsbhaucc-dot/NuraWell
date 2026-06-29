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
        tab: 'from-violet-300 to-violet-400',
        body: 'from-violet-400 via-violet-500 to-indigo-600',
        glow: 'shadow-violet-900/25',
      };
    case 'journey':
      return {
        tab: 'from-rose-300 to-rose-400',
        body: 'from-rose-400 via-rose-500 to-pink-600',
        glow: 'shadow-rose-900/25',
      };
    case 'guides':
      return {
        tab: 'from-amber-300 to-amber-400',
        body: 'from-amber-400 via-amber-500 to-orange-600',
        glow: 'shadow-amber-900/25',
      };
    case 'audio':
      return {
        tab: 'from-sky-300 to-sky-400',
        body: 'from-sky-400 via-sky-500 to-blue-600',
        glow: 'shadow-sky-900/25',
      };
    case 'video':
      return {
        tab: 'from-fuchsia-300 to-fuchsia-400',
        body: 'from-fuchsia-400 via-fuchsia-500 to-purple-600',
        glow: 'shadow-fuchsia-900/25',
      };
    case 'files':
      return {
        tab: 'from-slate-300 to-slate-400',
        body: 'from-slate-400 via-slate-500 to-slate-700',
        glow: 'shadow-slate-900/25',
      };
    default:
      return {
        tab: 'from-emerald-300 to-emerald-400',
        body: 'from-emerald-400 via-emerald-500 to-teal-600',
        glow: 'shadow-emerald-900/25',
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
        'hover:bg-white/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50',
        variant === 'category' ? 'min-h-[9.5rem]' : 'min-h-[8.5rem]'
      )}
    >
      <div className="relative">
        <div
          className={cn(
            'relative h-[3.4rem] w-[4.6rem] transition-transform duration-200 group-hover:scale-[1.04] group-active:scale-[0.98]',
            variant === 'category' && 'h-[3.8rem] w-[5rem]'
          )}
        >
          <div
            className={cn(
              'absolute top-0 right-[0.85rem] h-[0.62rem] w-[2.1rem] rounded-t-[5px] bg-gradient-to-b',
              accent.tab,
              variant === 'category' && 'right-[0.95rem] h-[0.7rem] w-[2.35rem]'
            )}
            aria-hidden
          />
          <div
            className={cn(
              'absolute inset-x-0 bottom-0 top-[0.45rem] rounded-[10px] rounded-tr-[4px] bg-gradient-to-br shadow-lg',
              accent.body,
              accent.glow,
              variant === 'category' && 'top-[0.5rem] rounded-[11px]'
            )}
            aria-hidden
          />
          <div
            className="pointer-events-none absolute inset-x-[0.35rem] top-[0.7rem] bottom-[0.35rem] rounded-[7px] bg-gradient-to-br from-white/40 via-white/10 to-transparent"
            aria-hidden
          />
          <div className="absolute inset-0 flex items-center justify-center pt-2">
            <TypeIcon className="h-5 w-5 text-white/90 drop-shadow-sm" aria-hidden />
          </div>
        </div>
        <span className="absolute -top-1 -left-1 min-w-[1.35rem] rounded-full bg-slate-900/80 px-1.5 py-0.5 text-[10px] font-bold text-white shadow-sm">
          {folder.count}
        </span>
      </div>

      <span className="line-clamp-2 w-full px-1 text-xs font-bold leading-tight text-slate-800">
        {folder.label}
      </span>
      {folder.latestTs > 0 ? (
        <span className="text-[10px] text-slate-500">
          עודכן {formatHebrewRelativeTimeSmart(folder.latestTs)}
        </span>
      ) : null}
    </button>
  );
}
