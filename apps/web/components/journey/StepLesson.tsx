'use client';

import { useState, useCallback, useRef, useEffect, useLayoutEffect, useMemo } from 'react';
import { animate, motion, useMotionValue } from 'framer-motion';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import type { JourneyStep, JourneyStepProgress, JourneyTaskDecisionStatus, StepSection } from '../../lib/types/journey';
import type { LessonAudioTrack } from '../../lib/types/audio';
import { VideoSection } from './VideoSection';
import { LessonAudioController } from './LessonAudioController';
import { QuizSection } from './QuizSection';
import { MiniGame } from './MiniGame';
import { CommitmentSection } from './CommitmentSection';
import { SummarySection } from './SummarySection';
import { StepProgress } from './StepProgress';
import { parseImmersiveAttentionStops } from '../../lib/journey/immersiveAttentionStops';
import { isCommitmentGateResolved } from '../../lib/journey/commitment-gate';
import { useJourneyProgressLive } from '../../lib/journey/use-journey-progress-live';

interface StepLessonProps {
  step: JourneyStep;
  initialProgress: JourneyStepProgress;
  userId: string;
  /** מגדר המשתמש מהפרופיל — לנוסח התחייבות מותאם */
  userGender?: 'male' | 'female' | null;
  /** רצועות מוזיקת רקע (מהפלייליסט המשויך לצעד) — מנוגנות לאורך כל השלבים. */
  audioTracks?: LessonAudioTrack[];
}

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

export function StepLesson({ step, initialProgress, userId, userGender = null, audioTracks = [] }: StepLessonProps) {
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [isTtsPlaying, setIsTtsPlaying] = useState(false);
  const handleVideoPlaybackChange = useCallback((active: boolean) => {
    setIsVideoPlaying(active);
  }, []);
  const handleTtsPlayingChange = useCallback((active: boolean) => {
    setIsTtsPlaying(active);
  }, []);

  const sections = useMemo<StepSection[]>(() => {
    const base: StepSection[] = ['video', 'quiz', 'game', 'commitment', 'summary'];
    return step.commitment ? base : base.filter((s) => s !== 'commitment');
  }, [step.commitment]);

  /** עצירות קשב במסך מלא — רק מ־text_content בבסיס הנתונים (עורך המנהל); ללא ברירת מחדל קשיחה בקוד */
  const effectiveImmersiveAttentionStops = parseImmersiveAttentionStops(step.text_content);
  const [progress, setProgress] = useState<JourneyStepProgress>(initialProgress);
  const [currentSection, setCurrentSection] = useState<StepSection>(() => {
    let s = initialProgress.last_section || 'video';
    if (!step.commitment && s === 'commitment') s = 'summary';
    return s;
  });
  /** נדרש כדי לאפשר מעבר לסיכום רק אחרי טיפול בהתחייבות (כולל דחייה) */
  const commitmentEverResolved = useRef(
    isCommitmentGateResolved(Boolean(step.commitment), initialProgress)
  );
  const [quizRemount, setQuizRemount] = useState(0);
  const [gameRemount, setGameRemount] = useState(0);
  const [videoRemount, setVideoRemount] = useState(0);
  const stepChromeRef = useRef<HTMLDivElement>(null);
  const lastLoggedTopRef = useRef<number | null>(null);
  const [immersiveViewportTopPx, setImmersiveViewportTopPx] = useState<number | null>(null);
  const progressRef = useRef(progress);
  const sectionSwipeDirRef = useRef(0);
  /** עקיבה אחרי האצבע בהחלקה + סנאפ אחרי שחרור */
  const xDrag = useMotionValue(0);
  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  const handleLiveProgress = useCallback((remote: JourneyStepProgress) => {
    setProgress((prev) => {
      const merged = { ...prev, ...remote };
      progressRef.current = merged;
      return merged;
    });
  }, []);

  useJourneyProgressLive(userId, handleLiveProgress, step.id);

  /* אחרי מעבר מהחלקה: x נשאר במיקום האצבע — נסיים בספרינג ל־0; אחרי כפתורים — איפוס */
  useLayoutEffect(() => {
    const dir = sectionSwipeDirRef.current;
    if (dir !== 0) {
      const ctrl = animate(xDrag, 0, {
        type: 'spring',
        stiffness: 420,
        damping: 38,
        mass: 0.78,
      });
      void ctrl.then(() => {
        sectionSwipeDirRef.current = 0;
      });
      return () => {
        ctrl.stop();
      };
    }
    xDrag.set(0);
    return undefined;
  }, [currentSection]);

  useEffect(() => {
    if (isCommitmentGateResolved(Boolean(step.commitment), progress)) {
      commitmentEverResolved.current = true;
    }
  }, [step.commitment, progress]);

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

  const currentIndex = sections.indexOf(currentSection);
  const isLastSection = currentIndex >= 0 && currentIndex === sections.length - 1;

  const canNavigateToTarget = useCallback(
    (target: StepSection) => {
      const p = progressRef.current;
      const ti = sections.indexOf(target);
      if (ti < 0) return false;
      for (let j = 0; j < ti; j++) {
        const s = sections[j];
        if (s === 'video' && !p.video_watched) return false;
        if (s === 'quiz' && step.quiz_questions.length > 0 && p.quiz_score === null) return false;
        if (s === 'game' && step.game_items.length > 0 && p.game_score === null) return false;
        if (s === 'commitment' && step.commitment && !commitmentEverResolved.current) return false;
      }
      return true;
    },
    [sections, step.commitment, step.quiz_questions.length, step.game_items.length]
  );

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
      if (!canNavigateToTarget(section)) return;
      sectionSwipeDirRef.current = 0;
      applySection(section);
    },
    [applySection, canNavigateToTarget]
  );

  const goNext = useCallback(
    (fromSwipe?: boolean) => {
      if (currentIndex < 0 || isLastSection) {
        if (fromSwipe) sectionSwipeDirRef.current = 0;
        return;
      }
      const nextSec = sections[currentIndex + 1];
      if (!canNavigateToTarget(nextSec)) {
        if (fromSwipe) sectionSwipeDirRef.current = 0;
        return;
      }
      if (!fromSwipe) sectionSwipeDirRef.current = 0;
      applySection(nextSec);
    },
    [currentIndex, isLastSection, sections, canNavigateToTarget, applySection]
  );

  const goBack = useCallback(
    (fromSwipe?: boolean) => {
      if (currentIndex <= 0) {
        if (fromSwipe) sectionSwipeDirRef.current = 0;
        return;
      }
      if (!fromSwipe) sectionSwipeDirRef.current = 0;
      applySection(sections[currentIndex - 1]);
    },
    [currentIndex, sections, applySection]
  );

  useEffect(() => {
    if (!step.commitment && currentSection === 'commitment') {
      setCurrentSection('summary');
    }
  }, [step.commitment, currentSection]);

  useEffect(() => {
    if (sections.length && sections.indexOf(currentSection) < 0) {
      setCurrentSection('video');
    }
  }, [sections, currentSection]);

  const handleVideoComplete = useCallback(() => {
    updateProgress({ video_watched: true });
    goNext();
  }, [updateProgress, goNext]);

  // 🎬 רישום אירוע צפייה לחישוב עלות Bunny (fire-and-forget, לא חוסם UI).
  const handleVideoViewStart = useCallback(() => {
    try {
      void fetch('/api/v1/video-views', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
        body: JSON.stringify({
          step_id: step.id,
          provider: step.video_provider,
          external_id: step.video_external_id,
          context: 'journey',
        }),
      }).catch(() => {});
    } catch {
      /* ignore — מעקב עלות לא קריטי ל-UX */
    }
  }, [step.id, step.video_provider, step.video_external_id]);

  const handleQuizComplete = useCallback((answers: Record<string, number>, score: number) => {
    updateProgress({ quiz_answers: answers, quiz_score: score });
    goNext();
  }, [updateProgress, goNext]);

  const handleGameComplete = useCallback((answers: Record<string, boolean>, score: number) => {
    updateProgress({ game_answers: answers, game_score: score });
    goNext();
  }, [updateProgress, goNext]);

  const handleCommitmentAccept = useCallback(() => {
    commitmentEverResolved.current = true;
    updateProgress({ commitment_accepted: true });
    goNext();
  }, [updateProgress, goNext]);

  const handleCommitmentChoice = useCallback((accepted: boolean) => {
    commitmentEverResolved.current = true;
    updateProgress({ commitment_accepted: accepted });
    goNext();
  }, [updateProgress, goNext]);

  const handleLessonComplete = useCallback(() => {
    updateProgress({ is_completed: true, completed_at: new Date().toISOString() });
  }, [updateProgress]);

  const handleTaskDecisionChange = useCallback((taskId: string, status: JourneyTaskDecisionStatus) => {
    const nowIso = new Date().toISOString();
    const currentTaskStatuses = progressRef.current.task_statuses ?? {};
    const nextTaskStatuses = {
      ...currentTaskStatuses,
      [taskId]: {
        status,
        decided_at: nowIso,
        execution_done: false as const,
      },
    };
    const nextTasksCompleted = {
      ...(progressRef.current.tasks_completed ?? {}),
      [taskId]: status === 'accepted',
    };
    const savePromise = updateProgress({
      task_statuses: nextTaskStatuses,
      tasks_completed: nextTasksCompleted,
    });

    if (status === 'accepted') {
      void fetch('/api/v1/almog-followup/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId }),
      }).catch(() => {});
    }
    return savePromise;
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
    if (step.commitment) commitmentEverResolved.current = false;
    const reset: Partial<JourneyStepProgress> = {
      video_watched: false,
      quiz_answers: {},
      quiz_score: null,
      game_answers: {},
      game_score: null,
      commitment_accepted: false,
      tasks_completed: {},
      task_statuses: {},
      habits_progress: {},
      is_completed: false,
      completed_at: null,
      last_section: 'video',
    };
    await updateProgress(reset);
    setQuizRemount(k => k + 1);
    setGameRemount(k => k + 1);
    setVideoRemount(k => k + 1);
    goToSection('video');
  }, [step.commitment, updateProgress, goToSection]);

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
            <button onClick={() => goBack()} disabled={currentIndex <= 0}
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
            <button
              onClick={() => goNext()}
              disabled={
                currentIndex < 0 ||
                isLastSection ||
                !sections[currentIndex + 1] ||
                !canNavigateToTarget(sections[currentIndex + 1]!)
              }
              className="w-9 h-9 rounded-xl flex items-center justify-center transition-all disabled:opacity-30"
              style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)' }}
              aria-label="השלב הבא"
            >
              <ArrowLeft className="w-4 h-4 text-white" />
            </button>
          </div>

          <StepProgress sections={sections} currentSection={currentSection} progress={progress} onSectionClick={goToSection} />
        </div>
      </div>

      {/* Content */}
      <div style={{ borderRadius: '26px 26px 0 0', marginTop: '-14px', position: 'relative', zIndex: 3 }}>
        <motion.div
          key={currentSection}
          dir="rtl"
          style={{ x: xDrag, willChange: 'transform' }}
          drag="x"
          dragDirectionLock
          dragConstraints={{ left: -240, right: 240 }}
          dragElastic={0.08}
          dragMomentum={false}
          dragTransition={{ bounceStiffness: 420, bounceDamping: 28 }}
          whileDrag={{ cursor: 'grabbing' }}
          className="cursor-grab touch-pan-y px-4 py-6 overflow-x-clip"
          onDragEnd={(_, info) => {
            const ox = info.offset.x;
            const vx = info.velocity.x;
            const oy = info.offset.y;
            const TH = 52;
            const VH = 260;

            const snapBack = () => {
              void animate(xDrag, 0, {
                type: 'spring',
                stiffness: 520,
                damping: 42,
                mass: 0.75,
              });
            };

            /* תנועה קטנה או כמעט רק אנכית — רק חזרה למרכז */
            if (Math.abs(ox) < 48 && Math.abs(vx) < 320) {
              snapBack();
              return;
            }
            if (Math.abs(ox) < Math.abs(oy) * 1.35) {
              snapBack();
              return;
            }

            /* RTL: ימינה (ox>0) = השלב הבא, שמאלה = חזרה */
            if (ox > TH || vx > VH) {
              const nextSec = currentIndex >= 0 ? sections[currentIndex + 1] : undefined;
              if (!nextSec || !canNavigateToTarget(nextSec)) {
                snapBack();
                return;
              }
              sectionSwipeDirRef.current = 1;
              goNext(true);
              return;
            }
            if (ox < -TH || vx < -VH) {
              if (currentIndex <= 0) {
                snapBack();
                return;
              }
              sectionSwipeDirRef.current = -1;
              goBack(true);
              return;
            }
            snapBack();
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
                onPlaybackChange={handleVideoPlaybackChange}
                onViewStart={handleVideoViewStart}
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
                onTtsPlayingChange={handleTtsPlayingChange}
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
                onTtsPlayingChange={handleTtsPlayingChange}
              />
            )}
            {currentSection === 'commitment' && step.commitment && (
              <CommitmentSection
                stepId={step.id}
                userId={userId}
                gender={userGender}
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
                onTaskDecisionChange={handleTaskDecisionChange}
              />
            )}
        </motion.div>
      </div>

      {audioTracks.length > 0 && (
        <LessonAudioController
          tracks={audioTracks}
          videoActive={currentSection === 'video' && isVideoPlaying}
          ttsActive={
            isTtsPlaying && (currentSection === 'quiz' || currentSection === 'game')
          }
          sectionKey={currentSection}
          anchorTopPx={immersiveViewportTopPx}
        />
      )}
    </div>
  );
}
