'use client';

import { useState, useCallback, useRef, useEffect, useLayoutEffect } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import type { JourneyStep, JourneyStepProgress, StepSection } from '../../lib/types/journey';
import { VideoSection } from './VideoSection';
import { QuizSection } from './QuizSection';
import { MiniGame } from './MiniGame';
import { CommitmentSection } from './CommitmentSection';
import { SummarySection } from './SummarySection';
import { StepProgress } from './StepProgress';
import { parseImmersiveAttentionStops } from '../../lib/journey/immersiveAttentionStops';

interface StepLessonProps {
  step: JourneyStep;
  initialProgress: JourneyStepProgress;
  userId: string;
}

const SECTIONS: StepSection[] = ['video', 'quiz', 'game', 'commitment', 'summary'];

async function saveJourneyProgress(
  userId: string,
  stepId: string,
  update: Partial<JourneyStepProgress>
): Promise<void> {
  await fetch('/api/v1/journey-progress', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ step_id: stepId, ...update }),
  });
}

export function StepLesson({ step, initialProgress, userId }: StepLessonProps) {
  const immersiveAttentionStops = parseImmersiveAttentionStops(step.text_content);
  const effectiveImmersiveAttentionStops = immersiveAttentionStops.length
    ? immersiveAttentionStops
    : (step.step_number === 1 ? [{
        id: 'default-water-hamburger-checkpoint',
        time_seconds: 105,
        question: 'האם לדעתך זה אומר שהגוף שורף המבורגר שלם מעצם שתיית מים לפני האוכל?',
        feedback: 'ממש לא. שתיית מים לפני ארוחה יכולה לתרום לשובע ולהפחית במעט את צריכת הקלוריות, אבל בדרך כלל מדובר בתוספת מתונה של עשרות קלוריות בלבד.',
        auto_resume_seconds: 6,
      }] : []);
  const [progress, setProgress] = useState<JourneyStepProgress>(initialProgress);
  const [currentSection, setCurrentSection] = useState<StepSection>(initialProgress.last_section || 'video');
  const [quizRemount, setQuizRemount] = useState(0);
  const [gameRemount, setGameRemount] = useState(0);
  const [videoRemount, setVideoRemount] = useState(0);
  const stepChromeRef = useRef<HTMLDivElement>(null);
  const lastLoggedTopRef = useRef<number | null>(null);
  const [immersiveViewportTopPx, setImmersiveViewportTopPx] = useState<number | null>(null);
  const progressRef = useRef(progress);
  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  useLayoutEffect(() => {
    const el = stepChromeRef.current;
    if (!el || typeof window === 'undefined') return;

    const measure = () => {
      const bottom = el.getBoundingClientRect().bottom;
      const px = Math.max(0, Math.round(bottom));
      setImmersiveViewportTopPx(px);
      // #region agent log
      if (lastLoggedTopRef.current !== px) {
        lastLoggedTopRef.current = px;
        fetch('http://127.0.0.1:7304/ingest/e0c3e9ba-ee31-4fb3-b095-72fbc06088f4', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '6fc6a6' },
          body: JSON.stringify({
            sessionId: '6fc6a6',
            runId: 'pre-fix',
            hypothesisId: 'H4',
            location: 'StepLesson.tsx:stepChromeMeasure',
            message: 'Step chrome bottom → immersive top',
            data: { immersiveViewportTopPx: px, stepId: step.id, currentSection },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
      }
      // #endregion
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure, { passive: true });
    window.addEventListener('scroll', measure, { passive: true, capture: true });
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [step.id, currentSection]);

  useEffect(() => {
    // #region agent log
    fetch('http://127.0.0.1:7304/ingest/e0c3e9ba-ee31-4fb3-b095-72fbc06088f4', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '6fc6a6' },
      body: JSON.stringify({
        sessionId: '6fc6a6',
        runId: 'pre-fix',
        hypothesisId: 'H1',
        location: 'StepLesson.tsx:currentSection',
        message: 'StepLesson section + step video fields',
        data: {
          currentSection,
          stepId: step.id,
          video_provider: step.video_provider,
          progress_last_section: progress.last_section,
          origin: typeof window !== 'undefined' ? window.location.origin : 'ssr',
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
  }, [currentSection, step.id, step.video_provider, progress.last_section]);

  const currentIndex = SECTIONS.indexOf(currentSection);
  const isLastSection = currentIndex === SECTIONS.length - 1;

  const updateProgress = useCallback(async (update: Partial<JourneyStepProgress>) => {
    const newProgress = { ...progressRef.current, ...update };
    progressRef.current = newProgress;
    setProgress(newProgress);
    await saveJourneyProgress(userId, step.id, update);
  }, [userId, step.id]);

  const goToSection = useCallback((section: StepSection) => {
    setCurrentSection(section);
    updateProgress({ last_section: section });
  }, [updateProgress]);

  const goNext = useCallback(() => {
    if (!isLastSection) {
      const nextSection = SECTIONS[currentIndex + 1];
      goToSection(nextSection);
    }
  }, [currentIndex, isLastSection, goToSection]);

  const goBack = useCallback(() => {
    if (currentIndex > 0) {
      const prevSection = SECTIONS[currentIndex - 1];
      goToSection(prevSection);
    }
  }, [currentIndex, goToSection]);

  const handleVideoComplete = useCallback(() => {
    updateProgress({ video_watched: true });
    goNext();
  }, [updateProgress, goNext]);

  const handleQuizComplete = useCallback((answers: Record<string, number>, score: number) => {
    updateProgress({ quiz_answers: answers, quiz_score: score });
    goNext();
  }, [updateProgress, goNext]);

  const handleGameComplete = useCallback((answers: Record<string, boolean>, score: number) => {
    updateProgress({ game_answers: answers, game_score: score });
    goNext();
  }, [updateProgress, goNext]);

  const handleCommitmentAccept = useCallback(() => {
    updateProgress({ commitment_accepted: true });
    goNext();
  }, [updateProgress, goNext]);

  const handleLessonComplete = useCallback(() => {
    updateProgress({ is_completed: true, completed_at: new Date().toISOString() });
  }, [updateProgress]);

  const resetQuizProgress = useCallback(async () => {
    const u: Partial<JourneyStepProgress> = { quiz_answers: {}, quiz_score: null };
    await updateProgress(u);
    setQuizRemount(k => k + 1);
  }, [updateProgress]);

  const resetGameProgress = useCallback(async () => {
    const u: Partial<JourneyStepProgress> = { game_answers: {}, game_score: null };
    await updateProgress(u);
    setGameRemount(k => k + 1);
  }, [updateProgress]);

  const handleReplay = useCallback(async () => {
    const reset: Partial<JourneyStepProgress> = {
      video_watched: false,
      quiz_answers: {},
      quiz_score: null,
      game_answers: {},
      game_score: null,
      commitment_accepted: false,
      is_completed: false,
      completed_at: null,
      last_section: 'video',
    };
    await updateProgress(reset);
    setQuizRemount(k => k + 1);
    setGameRemount(k => k + 1);
    setVideoRemount(k => k + 1);
    goToSection('video');
  }, [updateProgress, goToSection]);

  return (
    <div className="min-h-screen" style={{ background: '#EDF5F0' }}>
      {/* Header */}
      <div
        ref={stepChromeRef}
        className="-mt-16 pt-16 relative overflow-hidden"
        style={{ background: 'linear-gradient(160deg, #064e3b 0%, #047857 50%, #10b981 100%)' }}
      >
        <div className="relative z-10 px-4 pb-8 pt-3">
          <div className="flex items-center justify-between mb-3">
            <button onClick={goBack} disabled={currentIndex === 0}
              className="w-9 h-9 rounded-xl flex items-center justify-center transition-all disabled:opacity-30"
              style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)' }}>
              <ArrowRight className="w-4 h-4 text-white" />
            </button>
            <div className="text-center flex-1 px-3">
              <p className="text-white/70 text-xs font-medium">צעד {step.step_number}</p>
              <h1 className="text-white text-lg font-black leading-tight truncate" style={{ fontFamily: "'Rubik','Heebo',sans-serif" }}>
                {step.title}
              </h1>
            </div>
            <button onClick={goNext} disabled={isLastSection}
              className="w-9 h-9 rounded-xl flex items-center justify-center transition-all disabled:opacity-30"
              style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)' }}>
              <ArrowLeft className="w-4 h-4 text-white" />
            </button>
          </div>

          <StepProgress sections={SECTIONS} currentSection={currentSection} progress={progress} onSectionClick={goToSection} />
        </div>
      </div>

      {/* Content */}
      <div style={{ borderRadius: '26px 26px 0 0', marginTop: '-14px', position: 'relative', zIndex: 3 }}>
        <div key={currentSection} className="px-4 py-6 transition-opacity duration-200 ease-out">
            {currentSection === 'video' && (
              <VideoSection
                key={videoRemount}
                provider={step.video_provider}
                externalId={step.video_external_id}
                externalUrl={step.video_external_url}
                title={step.video_title || step.title}
                immersiveAttentionStops={effectiveImmersiveAttentionStops}
                onComplete={handleVideoComplete}
                isWatched={progress.video_watched}
                immersiveViewportTopPx={immersiveViewportTopPx}
              />
            )}
            {currentSection === 'quiz' && (
              <QuizSection
                key={quizRemount}
                questions={step.quiz_questions}
                existingAnswers={progress.quiz_answers}
                onComplete={handleQuizComplete}
                onResetQuiz={resetQuizProgress}
              />
            )}
            {currentSection === 'game' && (
              <MiniGame
                key={gameRemount}
                items={step.game_items}
                existingAnswers={progress.game_answers}
                onComplete={handleGameComplete}
                onResetGame={resetGameProgress}
              />
            )}
            {currentSection === 'commitment' && step.commitment && (
              <CommitmentSection
                commitment={step.commitment}
                isAccepted={progress.commitment_accepted}
                onAccept={handleCommitmentAccept}
              />
            )}
            {currentSection === 'summary' && (
              <SummarySection
                step={step}
                progress={progress}
                onReplay={handleReplay}
                onComplete={handleLessonComplete}
              />
            )}
        </div>
      </div>
    </div>
  );
}
