'use client';

import { FolderOpen } from 'lucide-react';
import { useMediaManager } from './MediaManagerProvider';
import type { MediaKind } from '@/lib/validation/media-asset';

type OpenMediaManagerButtonProps = {
  kind: MediaKind | MediaKind[];
  label?: string;
  pickLabel?: string;
  className?: string;
  onPicked?: (asset: import('./types').MediaAsset) => void;
};

export function OpenMediaManagerButton({
  kind,
  label = 'מנהל קבצים',
  pickLabel,
  className = '',
  onPicked,
}: OpenMediaManagerButtonProps) {
  const { open } = useMediaManager();

  return (
    <button
      type="button"
      onClick={() =>
        open({
          kind,
          mode: onPicked ? 'pick' : 'browse',
          title: pickLabel ?? label,
          onSelect: onPicked,
        })
      }
      className={
        className ||
        'inline-flex items-center gap-2 rounded-xl border border-primary-300/60 bg-primary-800/10 px-4 py-2 text-sm font-bold text-primary-900 backdrop-blur-sm transition hover:bg-primary-800/20'
      }
    >
      <FolderOpen className="h-4 w-4" />
      {label}
    </button>
  );
}
