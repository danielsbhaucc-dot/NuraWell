'use client';

import {
  useEffect,
  useRef,
  useState,
  useCallback,
  forwardRef,
  type CSSProperties,
  type MutableRefObject,
} from 'react';

export type HlsVideoProps = {
  src: string;
  className?: string;
  style?: CSSProperties;
  /** className on the inner video element (default: object-contain) */
  videoClassName?: string;
  autoPlay?: boolean;
  playsInline?: boolean;
  muted?: boolean;
  controls?: boolean;
  onLoaded?: () => void;
  onEnded?: () => void;
  onError?: () => void;
};

/**
 * Safari מחזיר "probably"/"maybe" ל-HLS; כרום מחזיר "" — אסור להזין m3u8 ישירות ל-video בכרום (DEMUXER_ERROR_COULD_NOT_PARSE).
 */
function shouldUseNativeHlsInVideoTag(video: HTMLVideoElement): boolean {
  if (typeof navigator === 'undefined') return false;
  const ct = video.canPlayType('application/vnd.apple.mpegurl');
  if (!ct) return false;
  const ua = navigator.userAgent;
  const isChromeFamily = /Chrome|Chromium|EdgA?|Edg\//.test(ua);
  if (isChromeFamily) return false;
  return ct === 'probably' || ct === 'maybe';
}

export const HlsVideo = forwardRef<HTMLVideoElement, HlsVideoProps>(function HlsVideo(
  { src, className, style, videoClassName, autoPlay, playsInline = true, muted, controls, onLoaded, onEnded, onError },
  forwardedRef
) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const setRefs = useCallback(
    (el: HTMLVideoElement | null) => {
      videoRef.current = el;
      if (typeof forwardedRef === 'function') {
        forwardedRef(el);
      } else if (forwardedRef) {
        (forwardedRef as MutableRefObject<HTMLVideoElement | null>).current = el;
      }
    },
    [forwardedRef]
  );

  const hlsRef = useRef<import('hls.js').default | null>(null);
  const onLoadedRef = useRef(onLoaded);
  onLoadedRef.current = onLoaded;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    let cancelled = false;
    let loaded = false;
    const fireLoaded = () => {
      if (loaded) return;
      loaded = true;
      onLoadedRef.current?.();
    };

    const onCanPlay = () => fireLoaded();

    const onVideoError = () => {
      const msg = video.error?.message || 'שגיאת ניגון';
      console.warn('HlsVideo: video error', msg);
      setLoadError(msg);
      onErrorRef.current?.();
      fireLoaded();
    };

    const runNativeHls = () => {
      setLoadError(null);
      video.src = src;
      video.addEventListener('canplay', onCanPlay, { once: true });
      video.addEventListener('loadeddata', onCanPlay, { once: true });
      video.addEventListener('error', onVideoError, { once: true });
      if (autoPlay) void video.play().catch(() => {});
    };

    const run = async () => {
      if (shouldUseNativeHlsInVideoTag(video)) {
        runNativeHls();
        return;
      }

      setLoadError(null);

      const { default: Hls } = await import('hls.js');
      if (cancelled) return;

      if (!Hls.isSupported()) {
        setLoadError('הדפדפן לא תומך בניגון HLS');
        fireLoaded();
        return;
      }

      const hls = new Hls({
        enableWorker: false,
        lowLatencyMode: false,
        xhrSetup: xhr => {
          xhr.withCredentials = false;
        },
      });
      hlsRef.current = hls;
      hls.loadSource(src);
      hls.attachMedia(video);

      const tryPlay = () => {
        if (autoPlay) void video.play().catch(() => {});
      };

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        fireLoaded();
        tryPlay();
      });

      hls.on(Hls.Events.MANIFEST_LOADED, () => {
        fireLoaded();
      });

      let recoverAttempts = 0;
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (!data.fatal) return;
        console.error('HLS load failed for src:', src, 'type:', data.type, 'details:', data.details);
        console.warn('HLS fatal', data.type, data.details, data.error);
        if (recoverAttempts < 1) {
          recoverAttempts += 1;
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            hls.startLoad();
            return;
          }
          if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            hls.recoverMediaError();
            return;
          }
        }
        setLoadError(`לא ניתן לטעון: ${src} — בדקו CORS ב-Bunny Pull Zone (video.nurawell.ai) או הפעילו NEXT_PUBLIC_BUNNY_STREAM_LIBRARY_ID למעבר ל-embed.`);
        onErrorRef.current?.();
        fireLoaded();
        hls.destroy();
        hlsRef.current = null;
      });
    };

    const failSafe = window.setTimeout(() => fireLoaded(), 20000);

    void run();

    return () => {
      cancelled = true;
      window.clearTimeout(failSafe);
      video.removeEventListener('canplay', onCanPlay);
      video.removeEventListener('error', onVideoError);
      video.pause();
      const hls = hlsRef.current;
      hlsRef.current = null;
      if (hls) {
        try {
          hls.destroy();
        } catch {
          /* ignore */
        }
      }
      video.removeAttribute('src');
      video.load();
    };
  }, [src, autoPlay]);

  return (
    <div className={className} style={style}>
      <video
        ref={setRefs}
        className={videoClassName ?? 'absolute inset-0 h-full w-full object-contain'}
        playsInline={playsInline}
        muted={muted}
        controls={controls}
        autoPlay={autoPlay}
        onEnded={onEnded}
        suppressHydrationWarning
      />
      {loadError ? (
        <p className="absolute bottom-2 left-2 right-2 z-20 rounded-lg bg-black/80 py-2 px-2 text-center text-xs text-red-200">
          {loadError}
        </p>
      ) : null}
    </div>
  );
});
