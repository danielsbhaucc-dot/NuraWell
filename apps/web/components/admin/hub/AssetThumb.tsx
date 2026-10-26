'use client';

import { useState } from 'react';
import { FileText, Film, Image as ImageIcon, Music, Shapes, Type as FontIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

export type Thumb = { type: 'image' | 'video' | 'cover' | 'none'; src: string | null };
const ICON: Record<string, typeof Music> = { audio: Music, image: ImageIcon, illustration: Shapes, icon: Shapes, video: Film, font: FontIcon, file: FileText };

/** Real thumbnail (image / video frame / song cover art). Fallback: one calm glass tone + crisp brand icon. */
export function AssetThumb({ thumb, kind, className, size = 'md' }: { thumb: Thumb; kind: string; className?: string; size?: 'sm' | 'md' | 'lg' }) {
  const [failed, setFailed] = useState(false);
  const Icon = ICON[kind] ?? FileText;
  const show = thumb.src && thumb.type !== 'none' && !failed;
  const ic = size === 'lg' ? 40 : size === 'sm' ? 18 : 28;
  return (
    <div className={cn('relative grid place-items-center overflow-hidden', show ? 'bg-primary-950/80' : 'border border-primary-900/10 bg-primary-800/[0.07] backdrop-blur-md', className)}>
      {show && thumb.type === 'video' ? (
        <video src={thumb.src!} muted playsInline preload="metadata" onError={() => setFailed(true)} className="h-full w-full object-cover" />
      ) : show ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumb.src!} alt="" loading="lazy" onError={() => setFailed(true)} className={cn('h-full w-full', kind === 'icon' || kind === 'illustration' ? 'object-contain p-4' : 'object-cover')} />
      ) : (
        <span className={cn('grid place-items-center rounded-2xl bg-primary-50/40 text-primary-700 shadow-[inset_0_1px_0_rgba(242,242,246,0.6),0_6px_16px_rgba(6,78,59,0.12)] ring-1 ring-primary-900/10', size === 'lg' ? 'h-20 w-20' : size === 'sm' ? 'h-9 w-9 rounded-xl' : 'h-14 w-14')}>
          <Icon size={ic} strokeWidth={1.75} />
        </span>
      )}
      {show && kind === 'audio' ? <span className="absolute bottom-1.5 left-1.5 grid h-6 w-6 place-items-center rounded-full bg-primary-950/60 text-accent-200 backdrop-blur"><Music size={12} /></span> : null}
      {show && thumb.type === 'video' ? <span className="absolute bottom-1.5 left-1.5 grid h-6 w-6 place-items-center rounded-full bg-primary-950/60 text-accent-200 backdrop-blur"><Film size={12} /></span> : null}
    </div>
  );
}
