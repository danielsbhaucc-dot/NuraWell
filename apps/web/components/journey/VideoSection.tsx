'use client';

import { useState, useEffect, useLayoutEffect, useCallback } from 'react';
import { Play, CheckCircle2, ArrowLeft } from 'lucide-react';
import { useRouter, usePathname } from 'next/navigation';
import {
  getBunnyHlsSourceFromFields,
  resolveBunnyStreamEmbedId,
} from '../../lib/journey/bunny-pull';
import { HlsVideoGate } from './HlsVideoGate';
import { FullscreenVideoPlayer } from './FullscreenVideoPlayer';
import type { ImmersiveAttentionStop } from '../../lib/journey/immersiveAttentionStops';

interface VideoSectionProps {
  provider: string | null;
  externalId: string | null;
  externalUrl: string | null;
  title: string;
  immersiveAttentionStops?: ImmersiveAttentionStop[];
  onComplete: () => void;
  isWatched: boolean;
  /** Bottom edge of step chrome (header + progress) in viewport px — immersive video starts here */
  immersiveViewportTopPx?: number | null;
}

function getEmbedUrl(
  provider: string | null,
  externalId: string | null,
  externalUrl: string | null,
  opts?: { autoplay?: boolean; bunnyCompact?: boolean }
): string | null {
  if (!provider) return null;
  const ap = opts?.autoplay !== false;
  switch (provider) {
    case 'heygen':
      return externalId ? `https://app.heygen.com/share/${externalId}` : null;
    case 'bunny':
      return null;
    case 'youtube':
      return externalId
        ? `https://www.youtube.com/embed/${externalId}?rel=0${ap ? '&autoplay=1' : ''}`
        : null;
    case 'vimeo':
      return externalId
        ? `https://player.vimeo.com/video/${externalId}${ap ? '?autoplay=1' : ''}`
        : null;
    case 'custom':
      return externalUrl ?? null;
    default:
      return null;
  }
}

function bunnyIframeUrl(embedId: string, opts?: { autoplay?: boolean; bunnyCompact?: boolean }): string {
  const ap = opts?.autoplay !== false;
  const compact = opts?.bunnyCompact ? 'true' : 'false';
  return `https://iframe.mediadelivery.net/embed/${embedId}?autoplay=${ap}&preload=true&responsive=true&playsinline=true&compactControls=${compact}&rememberPosition=false`;
}

export function VideoSection({
  provider,
  externalId,
  externalUrl,
  title,
  immersiveAttentionStops,
  onComplete,
  isWatched,
  immersiveViewportTopPx,
}: VideoSectionProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [inlineLoaded, setInlineLoaded] = useState(false);

  const providerKey = (provider ?? '').trim().toLowerCase();
  const isBunnyProvider = providerKey === 'bunny';

  const bunnyHlsCandidate = isBunnyProvider ? getBunnyHlsSourceFromFields(externalId, externalUrl) : null;
  const bunnyEmbedId = isBunnyProvider ? resolveBunnyStreamEmbedId(externalId, externalUrl) : null;
  const bunnyHlsSrc = bunnyHlsCandidate;
  const isBunnyHls = isBunnyProvider && !!bunnyHlsSrc;
  const isBunnyIframe = isBunnyProvider && !isBunnyHls && !!bunnyEmbedId;

  // Fullscreen immersive mode lifecycle
  const [immersiveOpen, setImmersiveOpen] = useState(false);
  const [immersiveReady, setImmersiveReady] = useState(false);
  const [immersiveFinished, setImmersiveFinished] = useState(false);
  const [inlinePlaying, setInlinePlaying] = useState(false);

  const baseEmbed = getEmbedUrl(providerKey || null, externalId, externalUrl, { autoplay: false, bunnyCompact: false });
  const isPlaceholder =
    externalId === 'PLACEHOLDER_HEYGEN_VIDEO_ID' ||
    (isBunnyProvider ? !bunnyHlsSrc && !bunnyEmbedId : !baseEmbed);
  const inlineIframeSrc = isBunnyIframe && bunnyEmbedId
    ? bunnyIframeUrl(bunnyEmbedId, { autoplay: inlinePlaying, bunnyCompact: false })
    : null;

  const [debugVideoOverlay, setDebugVideoOverlay] = useState(false);
  const [immersiveLogicBranch, setImmersiveLogicBranch] = useState<string>('');

  useLayoutEffect(() => {
    if (typeof window === 'undefined') return;
    setDebugVideoOverlay(new URLSearchParams(window.location.search).get('debugVideo') === '1');
  }, [pathname]);

  useEffect(() => {
    const row = {
      providerRaw: provider ?? 'NULL',
      providerKey: providerKey || 'NULL',
      externalId: externalId || 'NULL',
      externalUrl: externalUrl || 'NULL',
      bunnyEmbedId: bunnyEmbedId || 'NULL',
      bunnyHlsSrc: bunnyHlsSrc || 'NULL',
      isPlaceholder,
      immersiveReady,
      immersiveOpen,
      immersiveFinished,
    };
    if (typeof window !== 'undefined') {
      (window as Window & { __nurawellVideoSectionDebug?: typeof row }).__nurawellVideoSectionDebug = row;
    }
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[NuraWell][VideoSection]', row);
    }
  }, [
    provider,
    providerKey,
    externalId,
    externalUrl,
    bunnyEmbedId,
    bunnyHlsSrc,
    isPlaceholder,
    immersiveReady,
    immersiveOpen,
    immersiveFinished,
  ]);

  useEffect(() => {
    setImmersiveReady(true);
    let branch:
      | 'open_immersive'
      | 'not_bunny_or_placeholder'
      | 'bunny_no_embed'
      | 'bunny_placeholder'
      | 'skip_already_watched' = 'not_bunny_or_placeholder';
    // First viewing only: skip immersive if this step's video was already marked watched (replay resets it)
    if (isWatched && isBunnyProvider && bunnyEmbedId && !isPlaceholder) {
      branch = 'skip_already_watched';
      setImmersiveOpen(false);
      setImmersiveFinished(true);
      setInlinePlaying(false);
    } else if (!isPlaceholder && isBunnyProvider && bunnyEmbedId) {
      branch = 'open_immersive';
      setImmersiveOpen(true);
      setImmersiveFinished(false);
    } else {
      setImmersiveOpen(false);
      if (isBunnyProvider && isPlaceholder) {
        branch = 'bunny_placeholder';
      } else if (isBunnyProvider && !isPlaceholder && !bunnyEmbedId) {
        branch = 'bunny_no_embed';
        setImmersiveFinished(true);
      }
    }
    // #region agent log
    fetch('http://127.0.0.1:7304/ingest/e0c3e9ba-ee31-4fb3-b095-72fbc06088f4', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '6fc6a6' },
      body: JSON.stringify({
        sessionId: '6fc6a6',
        runId: 'pre-fix',
        hypothesisId: 'H2',
        location: 'VideoSection.tsx:immersiveEffect',
        message: 'Immersive gate branch',
        data: {
          branch,
          pathname,
          providerKey,
          isPlaceholder,
          isBunnyProvider,
          isWatched,
          bunnyEmbedId: bunnyEmbedId ?? null,
          hasHls: Boolean(bunnyHlsSrc),
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    setImmersiveLogicBranch(branch);
  }, [isPlaceholder, isBunnyProvider, bunnyEmbedId, pathname, providerKey, bunnyHlsSrc, isWatched]);

  const handleImmersiveEnded = useCallback(() => {
    setImmersiveOpen(false);
    setImmersiveFinished(true);
    // Mark as played so mini-player shows replay state
    setInlinePlaying(false);
  }, []);

  const handleImmersiveExit = useCallback(() => {
    setImmersiveOpen(false);
    router.push('/journey');
  }, [router]);

  const showBunnyReplayGate = (isBunnyIframe || isBunnyHls) && !inlinePlaying;
  const showNonBunnyIframe = !isPlaceholder && !isBunnyHls && !isBunnyIframe && !!baseEmbed;
  const showInlineIframe = !isPlaceholder && isBunnyIframe && inlinePlaying && !!inlineIframeSrc;
  const showBunnyHls = !isPlaceholder && isBunnyHls && inlinePlaying;
  const shouldBlockInlineUntilImmersiveEnds =
    immersiveReady && isBunnyProvider && !!bunnyEmbedId && !isPlaceholder && !immersiveFinished;

  const willRenderFullscreen = Boolean(immersiveReady && immersiveOpen && bunnyEmbedId);
  useEffect(() => {
    // #region agent log
    fetch('http://127.0.0.1:7304/ingest/e0c3e9ba-ee31-4fb3-b095-72fbc06088f4', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '6fc6a6' },
      body: JSON.stringify({
        sessionId: '6fc6a6',
        runId: 'pre-fix',
        hypothesisId: 'H3',
        location: 'VideoSection.tsx:renderGate',
        message: 'Fullscreen render predicate',
        data: {
          willRenderFullscreen,
          immersiveReady,
          immersiveOpen,
          bunnyEmbedId: bunnyEmbedId ?? null,
          shouldBlockInlineUntilImmersiveEnds,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
  }, [
    willRenderFullscreen,
    immersiveReady,
    immersiveOpen,
    bunnyEmbedId,
    shouldBlockInlineUntilImmersiveEnds,
  ]);

  return (
    <div className="space-y-5">
      {immersiveReady && immersiveOpen && bunnyEmbedId && (
        <FullscreenVideoPlayer
          bunnyEmbedId={bunnyEmbedId}
          pullZoneHlsSrc={bunnyHlsSrc}
          title={title}
          attentionStops={immersiveAttentionStops}
          viewportInsetTopPx={immersiveViewportTopPx ?? undefined}
          onEnded={handleImmersiveEnded}
          onExit={handleImmersiveExit}
          onTimeUpdate={() => {
            // FUTURE CHECKPOINTS: use seconds/duration from Bunny timeupdate
          }}
        />
      )}

      {shouldBlockInlineUntilImmersiveEnds ? null : (
        <>
      <div className="text-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-3"
          style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}>
          <Play className="w-4 h-4 text-emerald-600" />
          <span className="text-sm font-bold text-emerald-700">צפו בסרטון</span>
        </div>
        <h2 className="text-2xl font-black" style={{ color: '#1A1730', fontFamily: "'Rubik','Heebo',sans-serif" }}>
          {title}
        </h2>
      </div>

      <div
        className="relative rounded-2xl overflow-hidden aspect-[9/16] md:aspect-[16/9]"
        style={{ background: '#0a1f1a' }}
      >
        {isPlaceholder ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #064e3b, #047857, #10b981)' }}>
            <div className="w-20 h-20 rounded-full flex items-center justify-center mb-4"
              style={{ background: 'rgba(255,255,255,0.15)', border: '2px solid rgba(255,255,255,0.3)' }}>
              <Play className="w-10 h-10 text-white ml-1" fill="white" />
            </div>
            <p className="text-white/90 text-lg font-bold mb-1">{title}</p>
            <p className="text-white/60 text-sm">הסרטון יהיה זמין בקרוב 🎬</p>
          </div>
        ) : showBunnyReplayGate ? (
          <button
            type="button"
            onClick={() => { setInlinePlaying(true); setInlineLoaded(false); }}
            className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-10 group"
            style={{ background: 'linear-gradient(145deg, #064e3b, #0f172a)' }}
          >
            <div className="w-20 h-20 rounded-full flex items-center justify-center transition-transform group-active:scale-95"
              style={{ background: 'rgba(16,185,129,0.35)', border: '2px solid rgba(52,211,153,0.5)' }}>
              <Play className="w-10 h-10 text-white ml-1" fill="white" />
            </div>
            <span className="text-white font-bold text-sm">הפעלת הסרטון שוב</span>
          </button>
        ) : null}

        {showNonBunnyIframe && (
          <>
            {!inlineLoaded && (
              <div className="absolute inset-0 flex items-center justify-center z-10"
                style={{ background: 'rgba(0,0,0,0.7)' }}>
                <div className="w-16 h-16 rounded-full flex items-center justify-center animate-pulse"
                  style={{ background: 'rgba(16,185,129,0.3)', border: '2px solid rgba(16,185,129,0.5)' }}>
                  <Play className="w-7 h-7 text-emerald-400 ml-0.5" fill="currentColor" />
                </div>
              </div>
            )}
            <iframe
              key={baseEmbed!}
              src={baseEmbed!}
              title={title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
              allowFullScreen
              className="absolute inset-0 w-full h-full border-0"
              onLoad={() => setInlineLoaded(true)}
              loading="lazy"
            />
          </>
        )}

        {showInlineIframe && (
          <>
            {!inlineLoaded && (
              <div className="absolute inset-0 flex items-center justify-center z-10"
                style={{ background: 'rgba(0,0,0,0.7)' }}>
                <div className="w-16 h-16 rounded-full flex items-center justify-center animate-pulse"
                  style={{ background: 'rgba(16,185,129,0.3)', border: '2px solid rgba(16,185,129,0.5)' }}>
                  <Play className="w-7 h-7 text-emerald-400 ml-0.5" fill="currentColor" />
                </div>
              </div>
            )}
            <iframe
              key={`inline-${inlineIframeSrc}-${inlinePlaying}`}
              src={inlineIframeSrc!}
              title={title}
              referrerPolicy="strict-origin-when-cross-origin"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
              allowFullScreen
              className="absolute inset-0 w-full h-full border-0"
              onLoad={() => setInlineLoaded(true)}
              loading="lazy"
            />
          </>
        )}

        {showBunnyHls && (
          <HlsVideoGate
            src={bunnyHlsSrc!}
            autoPlay={true}
            controls={true}
            className="absolute inset-0 w-full h-full object-contain bg-black"
            onLoaded={() => setInlineLoaded(true)}
            onEnded={() => {
              // Automatically handle completion or close if needed
            }}
          />
        )}

      </div>

      <div className="text-center transition-opacity duration-300 ease-out">
        {isWatched ? (
          <div className="inline-flex items-center gap-2 px-5 py-3 rounded-xl text-emerald-700 font-bold"
            style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)' }}>
            <CheckCircle2 className="w-5 h-5" />
            <span>צפית בסרטון ✓</span>
          </div>
        ) : null}
        <button onClick={onComplete}
          className="mt-3 w-full py-4 rounded-2xl font-bold text-lg text-white flex items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-95"
          style={{ background: 'linear-gradient(135deg, #047857, #10b981)', boxShadow: '0 6px 20px rgba(16,185,129,0.3)' }}>
          <span>{isWatched ? 'המשך לשאלות' : 'צפיתי — קדימה!'}</span>
          <ArrowLeft className="w-5 h-5" />
        </button>
      </div>
        </>
      )}

      {debugVideoOverlay && (
        <div
          className="fixed left-0 right-0 z-[99999] px-2 py-2 text-[10px] leading-tight font-mono text-white text-left break-all pointer-events-none"
          style={{
            top: 'calc(4.25rem + env(safe-area-inset-top, 0px))',
            background: 'rgba(0,0,0,0.92)',
            borderBottom: '1px solid rgba(16,185,129,0.35)',
            maxHeight: '42vh',
            overflow: 'auto',
          }}
        >
          <div className="font-bold text-emerald-300 mb-1">debugVideo=1 · VideoSection (no console needed)</div>
          <div>path: {pathname}</div>
          <div>host: {typeof window !== 'undefined' ? window.location.host : '—'}</div>
          <div>search: {typeof window !== 'undefined' ? window.location.search || '(empty)' : '—'}</div>
          <div>immersive branch: {immersiveLogicBranch || '—'}</div>
          <div>willFullscreen: {String(willRenderFullscreen)}</div>
          <div>provider raw: {String(provider)}</div>
          <div>provider key: {providerKey || '—'}</div>
          <div>embed: {bunnyEmbedId || '—'}</div>
          <div>hls: {bunnyHlsSrc ? `${bunnyHlsSrc.slice(0, 64)}…` : '—'}</div>
          <div>
            immersive: ready={String(immersiveReady)} open={String(immersiveOpen)} done={String(immersiveFinished)}
          </div>
          <div>placeholder: {String(isPlaceholder)}</div>
        </div>
      )}
    </div>
  );
}
