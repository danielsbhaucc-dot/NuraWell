'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Volume2, VolumeX } from 'lucide-react';
import { ComingSoonExperience } from '@/components/coming-soon/ComingSoonExperience';
import type { ComingSoonLyrics } from '@/lib/coming-soon/lyrics';
import {
  type ChallengeIntroLine,
  renderIntroLine,
} from '@/lib/challenge/content';
import { challengeIntroLine, firstNameFromFullName, genderFromProfile } from '@/lib/challenge/gender-copy';

type Props = {
  songUrl: string | null;
  songTitle: string | null;
  lyrics: ComingSoonLyrics | null;
  revolutionLines: string[] | null;
  introLines: ChallengeIntroLine[];
  introTtsUrl: string | null;
  firstName: string;
  gender: string | null;
  isDemo: boolean;
};

export function ChallengeIntroExperience({
  songUrl,
  songTitle,
  lyrics,
  revolutionLines,
  introLines,
  introTtsUrl,
  firstName,
  gender,
  isDemo,
}: Props) {
  const router = useRouter();
  const g = genderFromProfile(gender);
  const name = firstName || firstNameFromFullName(null);
  const fallbackLine = challengeIntroLine(name, g);
  const ttsRef = useRef<HTMLAudioElement | null>(null);
  const [muted, setMuted] = useState(false);
  const [showLines, setShowLines] = useState(false);

  const renderedLines = introLines.map((l) => renderIntroLine(l.text, name));

  useEffect(() => {
    const t = setTimeout(() => setShowLines(true), 8000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!introTtsUrl || muted) return;
    const audio = new Audio(introTtsUrl);
    ttsRef.current = audio;
    audio.volume = 0.9;
    audio.play().catch(() => {});
    return () => {
      audio.pause();
    };
  }, [introTtsUrl, muted]);

  const onIntroFinished = useCallback(async () => {
    ttsRef.current?.pause();
    await fetch('/api/v1/challenge/intro-complete', {
      method: 'POST',
      credentials: 'include',
    });
    router.push('/challenge/eating-window');
  }, [router]);

  return (
    <div className="relative">
      {isDemo ? (
        <div className="fixed left-0 right-0 top-0 z-50 border-b border-amber-400/30 bg-amber-500/15 px-4 py-2 text-center text-sm text-amber-100">
          מצב דמו — פתיחת אתגר
        </div>
      ) : null}

      {introTtsUrl ? (
        <button
          type="button"
          onClick={() => setMuted((m) => !m)}
          className="fixed left-4 top-16 z-50 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-md"
          aria-label={muted ? 'הפעל תמלול' : 'השתק תמלול'}
        >
          {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
        </button>
      ) : null}

      {showLines ? (
        <div className="fixed left-0 right-0 top-12 z-40 max-h-[40vh] overflow-y-auto px-4 sm:top-4">
          <div className="mx-auto max-w-md space-y-2 rounded-2xl border border-white/10 bg-black/50 p-4 backdrop-blur-md">
            {(renderedLines.length ? renderedLines : [fallbackLine]).map((line, i) => (
              <p
                key={i}
                className={`text-sm leading-relaxed ${
                  introLines[i]?.emphasis ? 'font-bold text-emerald-300' : 'text-white/85'
                }`}
              >
                {line}
              </p>
            ))}
          </div>
        </div>
      ) : null}

      <ComingSoonExperience
        songUrl={songUrl}
        songTitle={songTitle}
        lyrics={lyrics}
        revolutionLines={revolutionLines}
      />
      <div className="fixed bottom-6 left-0 right-0 z-40 flex justify-center px-4">
        <button
          type="button"
          onClick={onIntroFinished}
          className="rounded-2xl bg-emerald-500 px-8 py-3 font-bold text-white shadow-lg shadow-emerald-600/30"
        >
          המשך להגדרת חלון אכילה
        </button>
      </div>
    </div>
  );
}
