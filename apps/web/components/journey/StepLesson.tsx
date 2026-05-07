'use client';

import { useState, useCallback, useRef, useEffect, useLayoutEffect } from 'react';
import { motion } from 'framer-motion';
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
        id: 'satiety-brain-checkpoint',
        time_seconds: 85,
        question: 'רגע, אז מתי בעצם המוח שלנו מבין שאנחנו שבעים?',
        options: ['רק כשהקלוריות נספגות בדם.', 'ברגע שהקיבה נמתחת פיזית.'],
        correct_option_index: 1,
        feedback_correct: 'בול. המוח מקבל אותות שובע כבר מהמתיחה של הקיבה ומההורמונים שמופרשים בדרך - לא רק אחרי ספיגת קלוריות בדם.',
        feedback_incorrect: 'כמעט. לרוב המוח מתחיל לקבל סימן שובע כבר כשהקיבה נמתחת פיזית, עוד לפני שכל הקלוריות נספגות בדם.',
        feedback: 'בול. המוח מקבל אותות שובע כבר מהמתיחה של הקיבה ומההורמונים שמופרשים בדרך - לא רק אחרי ספיגת קלוריות בדם.',
        auto_resume_seconds: 10,
      }, {
        id: 'default-water-hamburger-checkpoint',
        time_seconds: 105,
        question: 'האם לדעתך זה אומר שהגוף שורף המבורגר שלם מעצם שתיית מים לפני האוכל?',
        feedback: 'ממש לא. שתיית מים לפני ארוחה יכולה לתרום לשובע ולהפחית במעט את צריכת הקלוריות, אבל בדרך כלל מדובר בתוספת מתונה של עשרות קלוריות בלבד.',
        auto_resume_seconds: 10,
      }, {
        id: 'self-reflection-sweet-craving-checkpoint',
        time_seconds: 120,
        question: 'קרה לך פעם שחיפשת משהו מתוק בארון ובעצם... פשוט לא שתית כל היום?',
        options: ['ברור, קורה לי מלא', 'האמת שפחות'],
        correct_option_index: null,
        feedback: 'ההיפותלמוס במוח לפעמים מבלבל בין צמא לרעב. בפעם הבאה שהדודא למתוק תופסת אותך - קודם כוס מים, חכי שתי דקות, ותני לגוף הזדמנות להירגע.',
        auto_resume_seconds: 10,
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
  const sectionSwipeDirRef = useRef(0);
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
      if (lastLoggedTopRef.current !== px) {
        lastLoggedTopRef.current = px;
      }
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

  const currentIndex = SECTIONS.indexOf(currentSection);
  const isLastSection = currentIndex === SECTIONS.length - 1;

  const updateProgress = useCallback(async (update: Partial<JourneyStepProgress>) => {
    const newProgress = { ...progressRef.current, ...update };
    progressRef.current = newProgress;
    setProgress(newProgress);
    await saveJourneyProgress(userId, step.id, update);
  }, [userId, step.id]);

  const applySection = useCallback((section: StepSection) => {
    setCurrentSection(section);
    updateProgress({ last_section: section });
  }, [updateProgress]);

  const goToSection = useCallback(
    (section: StepSection) => {
      sectionSwipeDirRef.current = 0;
      applySection(section);
    },
    [applySection]
  );

  const goNext = useCallback(
    (fromSwipe?: boolean) => {
      if (isLastSection) {
        if (fromSwipe) sectionSwipeDirRef.current = 0;
        return;
      }
      if (!fromSwipe) sectionSwipeDirRef.current = 0;
      applySection(SECTIONS[currentIndex + 1]);
    },
    [currentIndex, isLastSection, applySection]
  );

  const goBack = useCallback(
    (fromSwipe?: boolean) => {
      if (currentIndex <= 0) {
        if (fromSwipe) sectionSwipeDirRef.current = 0;
        return;
      }
      if (!fromSwipe) sectionSwipeDirRef.current = 0;
      applySection(SECTIONS[currentIndex - 1]);
    },
    [currentIndex, applySection]
  );

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

  const handleCommitmentChoice = useCallback((accepted: boolean) => {
    updateProgress({ commitment_accepted: accepted });
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

  const resetVideoWatchOnly = useCallback(async () => {
    if (progress.video_watched) return;
    await updateProgress({ video_watched: false });
    setVideoRemount(k => k + 1);
  }, [progress.video_watched, updateProgress]);

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
            <button onClick={() => goBack()} disabled={currentIndex === 0}
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
            <button onClick={() => goNext()} disabled={isLastSection}
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
        <motion.div
          key={currentSection}
          custom={sectionSwipeDirRef.current}
          variants={{
            enter: (dir: number) =>
              dir === 0
                ? { x: 0, opacity: 1 }
                : { x: dir * 22, opacity: 0.88 },
            center: { x: 0, opacity: 1 },
          }}
          initial="enter"
          animate="center"
          transition={{ duration: 0.2, ease: [0.25, 0.9, 0.35, 1] }}
          onAnimationComplete={() => {
            sectionSwipeDirRef.current = 0;
          }}
          className="px-4 py-6"
          onPanEnd={(_, info) => {
            const ox = info.offset.x;
            const vx = info.velocity.x;
            const oy = info.offset.y;
            if (Math.abs(ox) < 52 && Math.abs(vx) < 380) return;
            if (Math.abs(ox) < Math.abs(oy) * 1.35) return;
            if (ox > 36 || vx > 220) {
              sectionSwipeDirRef.current = 1;
              goBack(true);
            } else if (ox < -36 || vx < -220) {
              sectionSwipeDirRef.current = -1;
              goNext(true);
            }
          }}
        >
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
                onResetVideoWatch={resetVideoWatchOnly}
                canResetVideoWatch={!progress.video_watched}
                videoResetNote="אם סיימת צפייה, האיפוס יתבצע דרך איפוס מלא של השיעור."
                immersiveViewportTopPx={immersiveViewportTopPx}
              />
            )}
            {currentSection === 'quiz' && (
              <QuizSection
                key={quizRemount}
                stepId={step.id}
                userId={userId}
                questions={step.quiz_questions}
                existingAnswers={progress.quiz_answers}
                onComplete={handleQuizComplete}
                onResetQuiz={resetQuizProgress}
              />
            )}
            {currentSection === 'game' && (
              <MiniGame
                key={gameRemount}
                stepId={step.id}
                userId={userId}
                items={step.game_items}
                existingAnswers={progress.game_answers}
                onComplete={handleGameComplete}
                onResetGame={resetGameProgress}
              />
            )}
            {currentSection === 'commitment' && step.commitment && (
              <CommitmentSection
                stepId={step.id}
                userId={userId}
                commitment={step.commitment}
                isAccepted={progress.commitment_accepted}
                onAccept={handleCommitmentAccept}
                onChoose={handleCommitmentChoice}
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
        </motion.div>
      </div>
    </div>
  );
}
