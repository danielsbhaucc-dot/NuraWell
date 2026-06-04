'use client';

import { FolderOpen } from 'lucide-react';
import { useMediaManager } from './MediaManagerProvider';

type AdminMediaManagerLauncherProps = {
  className?: string;
  label?: string;
  labelClassName?: string;
  iconSize?: number;
  hideLabel?: boolean;
};

export function AdminMediaManagerLauncher({
  className,
  label = 'ספריית מדיה',
  labelClassName,
  iconSize = 16,
  hideLabel = false,
}: AdminMediaManagerLauncherProps) {
  const { open } = useMediaManager();

  return (
    <button
      type="button"
      onClick={() => open({ mode: 'browse', title: 'מנהל קבצים' })}
      title={label}
      className={
        className ??
        'inline-flex min-h-10 items-center justify-center gap-2 rounded-2xl border border-emerald-300/60 bg-emerald-500/15 px-3 py-2 text-sm font-bold text-emerald-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] backdrop-blur-md transition hover:bg-emerald-500/25'
      }
    >
      <FolderOpen size={iconSize} className="shrink-0" />
      {hideLabel ? null : <span className={labelClassName ?? 'truncate'}>{label}</span>}
    </button>
  );
}
