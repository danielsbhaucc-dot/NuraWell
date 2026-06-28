'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BookOpen, Clock, ChevronLeft, ChevronRight, Play,
  CheckCircle2, Sparkles, Award,
} from 'lucide-react';
import { cn } from '../../lib/cn';
import { GuideBackIconButton } from './GuideBackIconButton';
import { GuideImmersiveAlmogHero } from './GuideImmersiveAlmogHero';
import { GuideImmersiveSlideHeader } from './GuideImmersiveSlideHeader';
import {
  GUIDE_IMMERSIVE_MODE_LABEL,
  guideBackToCoverLabel,
  guidePathIntroHint,
  type ProfileGender,
} from '../../lib/profile/personalized-copy';

interface PathLesson {
  id: string;
  title: string;
  description: string | null;
  lesson_type: string;
  duration_minutes: number | null;
  is_completed: boolean;
}

interface GuideLearningPathProps {
  course: {
    id: string;
    title: string;
    description: string | null;
    background_image_url?: string | null;
    thumbnail_url: string | null;
    lessons: PathLesson[];
  };
  progress: number;
  completedCount: number;
  firstIncompleteLessonId: string | null;
  gender?: ProfileGender;
  onExit: () => void;
}

const slideVariants = {
  enter: (dir: number) => ({ opacity: 0, x: dir > 0 ? 80 : -80, scale: 0.96 }),
  center: { opacity: 1, x: 0, scale: 1 },
  exit: (dir: number) => ({ opacity: 0, x: dir > 0 ? -80 : 80, scale: 0.96 }),
};

export function GuideLearningPath({
  course, progress, completedCount, firstIncompleteLessonId, gender = null, onExit,
}: GuideLearningPathProps) {
  const bgUrl = course.background_image_url || course.thumbnail_url;
  const totalSlides = course.lessons.length + 2; // intro + lessons + outro
  const [slideIdx, setSlideIdx] = useState(0);
  const [direction, setDirection] = useState(1);

  const goTo = useCallback((idx: number) => {
    setDirection(idx > slideIdx ? 1 : -1);
    setSlideIdx(Math.max(0, Math.min(totalSlides - 1, idx)));
  }, [slideIdx, totalSlides]);

  const goNext = useCallback(() => goTo(slideIdx + 1), [goTo, slideIdx]);
  const goPrev = useCallback(() => goTo(slideIdx - 1), [goTo, slideIdx]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goNext();
      else if (e.key === 'ArrowRight') goPrev();
      else if (e.key === 'Escape') onExit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goNext, goPrev, onExit]);

  const progressPct = totalSlides > 1 ? Math.round((slideIdx / (totalSlides - 1)) * 100) : 100;

  return (
    <motion.div
      className="fixed inset-0 z-[75] flex flex-col overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{ width: '100vw', height: '100vh' }}
    >
      {bgUrl ? (
        <div className="absolute inset-0">
          <Image src={bgUrl} alt="" fill className="object-cover" priority />
        </div>
      ) : (
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(160deg, #064e3b, #0f766e, #1f2937)' }}
          aria-hidden
        />
      )}
      <div
        className="absolute inset-0"
        aria-hidden
        style={{
          background:
            'linear-gradient(180deg, rgba(17,24,39,0.7) 0%, rgba(0,0,0,0.55) 50%, rgba(0,0,0,0.88) 100%)',
        }}
      />

      {/* Top bar */}
      <div className="relative z-10 px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-2">
        <div className="mb-3 flex items-center gap-3">
          <GuideBackIconButton
            onClick={onExit}
            ariaLabel={guideBackToCoverLabel()}
            variant="immersive"
          />
          <div className="flex-1 min-w-0">
            <div className="mb-1 flex items-center justify-between text-[11px] font-bold text-white/60">
              <span className="inline-flex items-center gap-1 truncate">
                <Sparkles className="h-3 w-3 shrink-0 text-emerald-300" />
                {GUIDE_IMMERSIVE_MODE_LABEL}
              </span>
              <span className="shrink-0">{slideIdx + 1} / {totalSlides}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,0.15)' }}>
              <motion.div
                className="h-full rounded-full"
                animate={{ width: `${progressPct}%` }}
                transition={{ duration: 0.35, ease: 'easeOut' }}
                style={{ background: 'linear-gradient(90deg, #10b981, #2dd4bf)' }}
              />
            </div>
          </div>
        </div>
        <GuideImmersiveSlideHeader
          eyebrow={GUIDE_IMMERSIVE_MODE_LABEL}
          title={course.title}
          subtitle={slideIdx === 0 ? 'פתיחה' : slideIdx === totalSlides - 1 ? 'סיום המסלול' : `פרק ${slideIdx}`}
        />
      </div>

      {/* Slides */}
      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 pb-4">
        <AnimatePresence mode="wait" custom={direction}>
          {slideIdx === 0 ? (
            <PathIntroSlide
              key="intro"
              direction={direction}
              title={course.title}
              description={course.description}
              lessonCount={course.lessons.length}
              progress={progress}
              gender={gender}
            />
          ) : slideIdx === totalSlides - 1 ? (
            <PathOutroSlide
              key="outro"
              direction={direction}
              progress={progress}
              completedCount={completedCount}
              totalLessons={course.lessons.length}
              firstLessonId={firstIncompleteLessonId}
              courseId={course.id}
            />
          ) : (
            <PathLessonSlide
              key={course.lessons[slideIdx - 1].id}
              direction={direction}
              lesson={course.lessons[slideIdx - 1]}
              index={slideIdx - 1}
            />
          )}
        </AnimatePresence>
      </div>

      {/* Navigation */}
      <div className="relative z-10 flex items-center justify-between gap-4 px-6 guide-immersive-nav-safe">
        <button
          type="button"
          onClick={goPrev}
          disabled={slideIdx === 0}
          className={cn(
            'flex items-center gap-1.5 rounded-xl px-4 py-3 text-sm font-bold backdrop-blur-md transition',
            slideIdx === 0 ? 'opacity-30 cursor-not-allowed' : 'hover:bg-white/15',
          )}
          style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.22)', color: '#fff' }}
        >
          <ChevronRight className="h-4 w-4" />
          הקודם
        </button>

        <div className="flex items-center gap-1.5">
          {Array.from({ length: totalSlides }).map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => goTo(i)}
              className={cn(
                'rounded-full transition-all',
                i === slideIdx ? 'h-2 w-5 bg-emerald-400' : 'h-2 w-2 bg-white/35 hover:bg-white/55',
              )}
              aria-label={`שקף ${i + 1}`}
            />
          ))}
        </div>

        {slideIdx < totalSlides - 1 ? (
          <button
            type="button"
            onClick={goNext}
            className="flex items-center gap-1.5 rounded-xl px-4 py-3 text-sm font-bold text-white transition hover:brightness-110"
            style={{
              background: 'linear-gradient(135deg, #047857, #14b8a6)',
              boxShadow: '0 8px 24px rgba(20,184,166,0.35)',
            }}
          >
            הבא
            <ChevronLeft className="h-4 w-4" />
          </button>
        ) : (
          <Link
            href={firstIncompleteLessonId ? `/lessons/${firstIncompleteLessonId}` : `/guides/${course.id}`}
            className="flex items-center gap-1.5 rounded-xl px-4 py-3 text-sm font-bold text-white transition hover:brightness-110"
            style={{
              background: 'linear-gradient(135deg, #047857, #14b8a6)',
              boxShadow: '0 8px 24px rgba(20,184,166,0.35)',
            }}
          >
            <Play className="h-4 w-4" fill="white" />
            {firstIncompleteLessonId ? 'התחל ללמוד' : 'חזרה למדריך'}
          </Link>
        )}
      </div>
    </motion.div>
  );
}

function PathIntroSlide({
  direction, title, description, lessonCount, progress, gender,
}: {
  direction: number;
  title: string;
  description: string | null;
  lessonCount: number;
  progress: number;
  gender: ProfileGender;
}) {
  return (
    <motion.div
      custom={direction}
      variants={slideVariants}
      initial="enter"
      animate="center"
      exit="exit"
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="w-full max-w-md text-center"
    >
      <div className="mb-5 flex justify-center">
        <GuideImmersiveAlmogHero size={92} />
      </div>
      <h2 className="mb-3 text-3xl font-black leading-tight text-white" style={{ textShadow: '0 4px 24px rgba(0,0,0,0.5)' }}>
        {title}
      </h2>
      {description ? (
        <p className="mb-5 text-sm leading-relaxed text-white/75">{description}</p>
      ) : null}
      <div className="flex flex-wrap items-center justify-center gap-2">
        <PathStat icon={BookOpen} value={`${lessonCount}`} label="פרקים" />
        {progress > 0 ? <PathStat icon={Award} value={`${progress}%`} label="הושלם" /> : null}
      </div>
      <p className="mt-6 text-xs font-semibold text-white/50">
        {guidePathIntroHint(gender)}
      </p>
    </motion.div>
  );
}

function PathLessonSlide({
  direction, lesson, index,
}: {
  direction: number;
  lesson: PathLesson;
  index: number;
}) {
  return (
    <motion.div
      custom={direction}
      variants={slideVariants}
      initial="enter"
      animate="center"
      exit="exit"
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="w-full max-w-md"
    >
      <div className="guide-immersive-slide-card rounded-3xl p-6">
        <div className="mb-4 flex items-center gap-3">
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-lg font-black text-white"
            style={{ background: 'linear-gradient(145deg, rgba(16,185,129,0.5), rgba(20,184,166,0.35))' }}
          >
            {lesson.is_completed ? <CheckCircle2 className="h-5 w-5" /> : index + 1}
          </span>
          <div className="text-right flex-1">
            <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-300/80">
              פרק {index + 1}
            </p>
            {lesson.duration_minutes ? (
              <p className="flex items-center gap-1 text-xs text-white/50">
                <Clock className="h-3 w-3" />
                {lesson.duration_minutes} דקות
              </p>
            ) : null}
          </div>
          {lesson.is_completed ? (
            <span className="rounded-full px-2.5 py-1 text-[10px] font-bold text-emerald-200"
              style={{ background: 'rgba(16,185,129,0.25)', border: '1px solid rgba(52,211,153,0.4)' }}>
              הושלם
            </span>
          ) : null}
        </div>
        <h3 className="mb-3 text-2xl font-black leading-snug text-white">{lesson.title}</h3>
        {lesson.description ? (
          <p className="text-sm leading-relaxed text-white/70">{lesson.description}</p>
        ) : (
          <p className="text-sm italic text-white/45">פרק זה מחכה לך — לחץ על &quot;התחל ללמוד&quot; בסוף המסלול</p>
        )}
        <Link
          href={`/lessons/${lesson.id}`}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold text-white transition hover:brightness-110"
          style={{ background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.3)' }}
        >
          <Play className="h-4 w-4" fill="white" />
          כניסה לפרק
        </Link>
      </div>
    </motion.div>
  );
}

function PathOutroSlide({
  direction, progress, completedCount, totalLessons, firstLessonId, courseId,
}: {
  direction: number;
  progress: number;
  completedCount: number;
  totalLessons: number;
  firstLessonId: string | null;
  courseId: string;
}) {
  const done = progress === 100;
  return (
    <motion.div
      custom={direction}
      variants={slideVariants}
      initial="enter"
      animate="center"
      exit="exit"
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="w-full max-w-md text-center"
    >
      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.15, type: 'spring' }}
        className="mx-auto mb-5 inline-flex h-16 w-16 items-center justify-center rounded-full"
        style={{
          background: done
            ? 'linear-gradient(145deg, #10b981, #14b8a6)'
            : 'linear-gradient(145deg, rgba(99,102,241,0.5), rgba(20,184,166,0.4))',
          boxShadow: '0 12px 32px rgba(20,184,166,0.35)',
        }}
      >
        {done ? <Award className="h-8 w-8 text-white" /> : <Sparkles className="h-8 w-8 text-white" />}
      </motion.div>
      <h2 className="mb-2 text-2xl font-black text-white">
        {done ? 'כל הכבוד! סיימת את המסלול' : 'מוכנים להתחיל?'}
      </h2>
      <p className="mb-4 text-sm text-white/70">
        {done
          ? `השלמת ${completedCount} מתוך ${totalLessons} פרקים.`
          : `עברת על ${totalLessons} פרקים במסלול. ${completedCount > 0 ? `כבר השלמת ${completedCount}.` : 'הגיע הזמן לצלול פנימה.'}`}
      </p>
      {!done && firstLessonId ? (
        <Link
          href={`/lessons/${firstLessonId}`}
          className="inline-flex items-center gap-2 rounded-2xl px-6 py-3.5 text-base font-black text-white"
          style={{
            background: 'linear-gradient(135deg, #047857, #14b8a6)',
            boxShadow: '0 10px 30px rgba(20,184,166,0.35)',
          }}
        >
          <Play className="h-5 w-5" fill="white" />
          המשך לפרק הבא
        </Link>
      ) : (
        <Link
          href={`/guides/${courseId}`}
          className="inline-flex items-center gap-2 rounded-2xl px-6 py-3.5 text-base font-black text-white"
          style={{ background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.3)' }}
        >
          חזרה למדריך
        </Link>
      )}
    </motion.div>
  );
}

function PathStat({
  icon: Icon, value, label,
}: {
  icon: React.ElementType;
  value: string;
  label: string;
}) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm backdrop-blur-md whitespace-nowrap"
      style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.25)' }}
    >
      <Icon className="h-4 w-4 text-emerald-200 shrink-0" />
      <span className="font-bold text-white">{value}</span>
      <span className="text-xs text-white/65">{label}</span>
    </span>
  );
}
