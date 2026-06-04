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
          dir="rtl"
          className="absolute top-8 left-0 z-[60] w-max min-w-[9rem] max-w-[15rem] space-y-1 rounded-xl border border-white/60 p-2.5 text-[11px] leading-relaxed text-slate-800 shadow-xl"
          style={{
            background: 'rgba(255,255,255,0.9)',
            backdropFilter: 'blur(14px)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <p className="font-black text-slate-900">
            {asset.source === 'pixabay' || asset.source === 'pexels'
              ? providerLabel(asset.source)
              : asset.source === 'suno'
                ? 'Suno'
                : 'מקור'}
          </p>
          {label ? <p className="text-slate-700">{label}</p> : null}
          {asset.credit?.license ? (
            <p className="text-slate-500">{asset.credit.license}</p>
          ) : null}
          {link ? (
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              className="block break-all font-semibold text-emerald-800 underline"
              dir="ltr"
            >
              קישור למקור
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
