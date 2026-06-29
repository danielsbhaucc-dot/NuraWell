'use client';

import { cn } from '@/lib/cn';
import { mediaAltText } from '@/lib/a11y/alt-text';
import type { FinderFolderEntry } from '@/lib/media-manager/smart-folders';
import type { MediaAsset } from './types';
import { CreditBadge } from './CreditBadge';
import { FinderFolderCard } from './FinderFolderCard';
import { FileText, Film, Music } from 'lucide-react';

type MediaFinderGridProps = {
  folders: FinderFolderEntry[];
  files: MediaAsset[];
  selectedId?: string | null;
  onOpenFolder: (folder: FinderFolderEntry) => void;
  onSelectFile: (asset: MediaAsset) => void;
  folderVariant?: 'category' | 'subfolder';
};

export function MediaFinderGrid({
  folders,
  files,
  selectedId,
  onOpenFolder,
  onSelectFile,
  folderVariant = 'subfolder',
}: MediaFinderGridProps) {
  return (
    <div
      className="grid grid-cols-2 gap-1 sm:grid-cols-3 sm:gap-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
      role="list"
    >
      {folders.map((folder) => (
        <div key={folder.path} role="listitem">
          <FinderFolderCard
            folder={folder}
            variant={folderVariant}
            onOpen={() => onOpenFolder(folder)}
          />
        </div>
      ))}
      {files.map((item) => (
        <div key={item.id} role="listitem" className="relative">
          <button
            type="button"
            onClick={() => onSelectFile(item)}
            className={cn(
              'group flex w-full flex-col items-center gap-2 rounded-2xl p-2 text-center transition',
              'hover:bg-white/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50',
              selectedId === item.id && 'bg-white/35 ring-2 ring-emerald-400/55'
            )}
          >
            <div className="relative w-full overflow-hidden rounded-xl border border-white/40 bg-white/20 shadow-sm transition group-hover:border-emerald-300/50">
              <AssetThumb asset={item} />
            </div>
            <span className="line-clamp-2 w-full px-1 text-[11px] font-bold leading-tight text-slate-800">
              {item.title ?? 'ללא שם'}
            </span>
          </button>
          <div className="pointer-events-none absolute top-2 left-2 z-10">
            <CreditBadge asset={item} />
          </div>
        </div>
      ))}
    </div>
  );
}

function AssetThumb({ asset }: { asset: MediaAsset }) {
  const url = asset.url ?? asset.public_url ?? asset.external_url;
  if (asset.kind === 'image' && url) {
    return (
      <img
        src={url}
        alt={mediaAltText({
          title: asset.alt_text ?? asset.title,
          fallback: 'תמונת מדיה',
        })}
        className="aspect-square w-full object-cover"
      />
    );
  }
  if (asset.kind === 'audio') {
    return (
      <div className="flex aspect-square items-center justify-center bg-emerald-900/15">
        <Music className="h-9 w-9 text-emerald-800/70" />
      </div>
    );
  }
  if (asset.kind === 'video') {
    return (
      <div className="flex aspect-square items-center justify-center bg-violet-900/12">
        <Film className="h-9 w-9 text-violet-800/70" />
      </div>
    );
  }
  return (
    <div className="flex aspect-square items-center justify-center bg-slate-900/8">
      <FileText className="h-9 w-9 text-slate-600" />
    </div>
  );
}
