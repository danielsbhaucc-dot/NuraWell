'use client';

import { useState } from 'react';
import { Info } from 'lucide-react';
import type { MediaAsset } from './types';
import { creditRequiresAttribution, creditDisplayLabel } from '@/lib/media/credit-display';
import { providerLabel } from '@/lib/media/stock-image-attribution';

type CreditBadgeProps = {
  asset: MediaAsset;
  className?: string;
};

export function CreditBadge({ asset, className = '' }: CreditBadgeProps) {
  const [open, setOpen] = useState(false);
  const show = creditRequiresAttribution(asset.source, asset.credit);
  if (!show && asset.source === 'upload') return null;

  const label = creditDisplayLabel(asset.credit, asset.source);
  const link =
    asset.credit?.page_url ||
    asset.credit?.link ||
    asset.credit?.provider_url ||
    null;

  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="flex h-6 w-6 items-center justify-center rounded-full border border-white/60 bg-black/35 text-white backdrop-blur-sm"
        aria-label="קרדיט ורישיון"
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      {open ? (
        <div
          className="absolute top-8 left-0 z-[60] min-w-[10rem] max-w-[14rem] rounded-xl border border-white/50 p-2 text-[10px] leading-relaxed text-slate-800 shadow-lg"
          style={{
            background: 'rgba(255,255,255,0.75)',
            backdropFilter: 'blur(12px)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <p className="font-bold">
            {asset.source === 'pixabay' || asset.source === 'pexels'
              ? providerLabel(asset.source)
              : asset.source === 'suno'
                ? 'Suno'
                : 'מקור'}
          </p>
          {label ? <p className="mt-0.5">{label}</p> : null}
          {asset.credit?.license ? <p className="mt-0.5 opacity-80">{asset.credit.license}</p> : null}
          {link ? (
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 block font-semibold text-emerald-800 underline"
            >
              קישור
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
