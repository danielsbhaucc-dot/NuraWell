'use client';

import { useState } from 'react';
import { Play, Maximize2, AlertCircle } from 'lucide-react';

interface VideoPlayerProps {
  provider: 'bunny' | 'heygen' | 'youtube' | 'vimeo' | 'custom';
  externalId?: string | null;
  externalUrl?: string | null;
  title?: string;
}

function getEmbedUrl(provider: VideoPlayerProps['provider'], externalId?: string | null, externalUrl?: string | null): string | null {
  switch (provider) {
    case 'bunny':
      return externalId ? `https://iframe.mediadelivery.net/embed/${externalId}?autoplay=false&preload=true` : null;
    case 'heygen':
      return externalId ? `https://app.heygen.com/share/${externalId}` : null;
    case 'youtube':
      return externalId ? `https://www.youtube.com/embed/${externalId}?rel=0&modestbranding=1` : null;
    case 'vimeo':
      return externalId ? `https://player.vimeo.com/video/${externalId}?color=14b8a6&title=0&byline=0` : null;
    case 'custom':
      return externalUrl ?? null;
    default:
      return null;
  }
}

export function VideoPlayer({ provider, externalId, externalUrl, title }: VideoPlayerProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  const embedUrl = getEmbedUrl(provider, externalId, externalUrl);

  if (!embedUrl) {
    return (
      <div className="video-container flex items-center justify-center"
        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="text-center">
          <AlertCircle className="w-10 h-10 text-slate-500 mx-auto mb-2" />
          <p className="text-slate-400 text-sm">הווידאו אינו זמין</p>
        </div>
      </div>
    );
  }

  if (hasError) {
    return (
      <div className="video-container flex items-center justify-center"
        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(239,68,68,0.2)' }}>
        <div className="text-center">
          <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-2" />
          <p className="text-slate-400 text-sm">שגיאה בטעינת הווידאו</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative rounded-2xl overflow-hidden" style={{ aspectRatio: '16/9', background: '#000' }}>
      {!isLoaded && (
        <div className="absolute inset-0 flex items-center justify-center z-10"
          style={{ background: 'rgba(0,0,0,0.8)' }}>
          <div className="w-16 h-16 rounded-full flex items-center justify-center animate-pulse"
            style={{ background: 'rgba(20,184,166,0.3)', border: '2px solid rgba(20,184,166,0.5)' }}>
            <Play className="w-7 h-7 text-primary-400 mr-[-2px]" fill="currentColor" />
          </div>
        </div>
      )}
      <iframe
        src={embedUrl}
        title={title || 'שיעור וידאו'}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        allowFullScreen
        className="absolute inset-0 w-full h-full"
        onLoad={() => setIsLoaded(true)}
        onError={() => setHasError(true)}
        loading="lazy"
      />
    </div>
  );
}
