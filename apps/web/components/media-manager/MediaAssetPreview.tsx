'use client';

import { Download, FileText } from 'lucide-react';
import { GlassAudioPlayer } from '@/components/audio/GlassAudioPlayer';
import { resolveBunnyStreamEmbedId } from '@/lib/journey/bunny-pull';
import { CreditBadge } from './CreditBadge';
import type { MediaAsset } from './types';

export function MediaAssetPreview({ asset }: { asset: MediaAsset }) {
  const url = asset.url ?? asset.public_url ?? asset.external_url ?? null;

  if (asset.kind === 'image' && url) {
    return (
      <div className="relative rounded-xl border border-white/45">
        <div className="overflow-hidden rounded-xl">
          <img src={url} alt={asset.alt_text ?? ''} className="max-h-48 w-full object-contain" />
        </div>
        <div className="absolute top-1 left-1 z-10">
          <CreditBadge asset={asset} />
        </div>
      </div>
    );
  }

  if (asset.kind === 'audio' && url) {
    return (
      <div className="space-y-2">
        <GlassAudioPlayer src={url} title={asset.title ?? undefined} />
        <div className="relative flex">
          <CreditBadge asset={asset} />
        </div>
      </div>
    );
  }

  if (asset.kind === 'video') {
    const embedId = resolveBunnyStreamEmbedId(asset.external_id, asset.external_url);
    if (embedId) {
      return (
        <div className="overflow-hidden rounded-xl border border-white/45">
          <iframe
            src={`https://iframe.mediadelivery.net/embed/${embedId}?autoplay=false`}
            loading="lazy"
            allow="accelerometer;gyroscope;autoplay;encrypted-media;picture-in-picture"
            allowFullScreen
            className="aspect-video w-full"
            title={asset.title ?? 'video'}
          />
        </div>
      );
    }
    return (
      <p className="break-all rounded-xl border border-white/45 bg-white/15 p-2 text-[11px] text-slate-700" dir="ltr">
        {asset.external_url ?? asset.external_id ?? '—'}
      </p>
    );
  }

  return (
    <a
      href={url ?? '#'}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 rounded-xl border border-white/45 bg-white/15 p-3 text-sm font-bold text-slate-800"
    >
      <FileText className="h-5 w-5 text-slate-600" />
      <span className="min-w-0 flex-1 truncate">{asset.title ?? asset.original_filename ?? 'קובץ'}</span>
      <Download className="h-4 w-4 text-emerald-700" />
    </a>
  );
}
