'use client';

import { useState, useRef, useEffect } from 'react';
import { Play, Pause, Volume2, VolumeX, RotateCcw, Headphones } from 'lucide-react';

interface AudioPlayerProps {
  src: string;
  title?: string;
  duration?: number | null;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** נגן אודיו לפרק — זכוכית iOS, קריא וברור על רקע בהיר. */
export function AudioPlayer({ src, title, duration }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(duration || 0);
  const [isMuted, setIsMuted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onDurationChange = () => setTotalDuration(audio.duration);
    const onEnded = () => setIsPlaying(false);
    const onCanPlay = () => setIsLoading(false);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('durationchange', onDurationChange);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('canplay', onCanPlay);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('durationchange', onDurationChange);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('canplay', onCanPlay);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
    };
  }, []);

  const togglePlay = async () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      await audioRef.current.play();
    }
  };

  const toggleMute = () => {
    if (!audioRef.current) return;
    audioRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!audioRef.current) return;
    const value = parseFloat(e.target.value);
    audioRef.current.currentTime = value;
    setCurrentTime(value);
  };

  const restart = () => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = 0;
    setCurrentTime(0);
  };

  const progress = totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0;

  return (
    <div className="lesson-audio-player" dir="ltr">
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio ref={audioRef} src={src} preload="metadata" />

      <div className="lesson-audio-player__inner">
        <div className="lesson-audio-player__glow" aria-hidden />
        <div className="lesson-audio-player__shine" aria-hidden />

        <div dir="rtl" className="flex items-center gap-3 mb-4">
          <div className="lesson-audio-player__icon-wrap">
            <Headphones className="w-5 h-5 text-emerald-700" />
          </div>
          {title && (
            <p className="text-[15px] font-black text-slate-800 line-clamp-2 leading-snug flex-1">
              {title}
            </p>
          )}
        </div>

        <div className="mb-4">
          <input
            type="range"
            min={0}
            max={totalDuration || 100}
            value={currentTime}
            onChange={handleSeek}
            aria-label="מיקום בניגון"
            className="nura-range lesson-audio-player__range w-full h-2.5 cursor-pointer appearance-none rounded-full"
            style={{
              background: `linear-gradient(to right, #10b981, #2dd4bf ${progress}%, rgba(15,23,42,0.12) ${progress}%)`,
            }}
          />
          <div className="flex justify-between text-[11px] font-bold tabular-nums text-slate-600 mt-1.5">
            <span>{formatTime(currentTime)}</span>
            <span>{totalDuration ? formatTime(totalDuration) : '--:--'}</span>
          </div>
        </div>

        <div className="flex items-center justify-center gap-5">
          <button
            type="button"
            onClick={restart}
            className="lesson-audio-player__side-btn"
            aria-label="חזור להתחלה"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => void togglePlay()}
            disabled={isLoading}
            className="lesson-audio-player__play-btn"
            aria-label={isPlaying ? 'השהה' : 'נגן'}
          >
            {isPlaying ? (
              <Pause className="w-7 h-7" fill="white" />
            ) : (
              <Play className="w-7 h-7 translate-x-px" fill="white" />
            )}
          </button>

          <button
            type="button"
            onClick={toggleMute}
            className="lesson-audio-player__side-btn"
            aria-label={isMuted ? 'בטל השתקה' : 'השתק'}
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
