'use client';

import Link from 'next/link';
import { useState, useCallback, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Clock, ChevronLeft, ChevronRight, Play, CheckCircle2, Sparkles,
  AlignLeft, ExternalLink as ExternalLinkIcon,
} from 'lucide-react';
import { cn } from '../../lib/cn';
import { sanitizeLessonHtml } from '../../lib/sanitize-lesson-html';
import { splitLessonHtmlToSections } from '../../lib/course/split-lesson-slides';
import { lessonHrefWithViewMode } from '../../lib/client/guide-view-mode';
import { GuideBackIconButton } from './GuideBackIconButton';
import { GuideImmersiveAlmogHero } from './GuideImmersiveAlmogHero';
import { GuideImmersiveSlideHeader } from './GuideImmersiveSlideHeader';
import { VideoPlayer } from './VideoPlayer';
import { AudioPlayer } from './AudioPlayer';
import { TaskChecklist } from './TaskChecklist';
import { HabitTracker } from './HabitTracker';
import type { LessonDetail, LessonProgressData } from '../../lib/types/course';
import {
  lessonPathIntroHint,
  lessonImmersiveModeLabel,
  lessonBackToReadLabel,
  type ProfileGender,
} from '../../lib/profile/personalized-copy';

interface NavLesson { id: string; title: string; }

type SlideKind =
  | 'intro'
  | 'text'
  | 'video'
  | 'audio'
  | 'tasks'
  | 'habits'
  | 'links'
  | 'outro';

interface LessonSlide {
  kind: SlideKind;
  key: string;
  heading?: string | null;
  html?: string;
  mediaIndex?: number;
}

const slideVariants = {
  enter: (dir: number) => ({ opacity: 0, x: dir > 0 ? 80 : -80, scale: 0.96 }),
  center: { opacity: 1, x: 0, scale: 1 },
  exit: (dir: number) => ({ opacity: 0, x: dir > 0 ? -80 : 80, scale: 0.96 }),
};

interface LessonImmersivePathProps {
  lesson: LessonDetail;
  progress: LessonProgressData;
  prevLesson: NavLesson | null;
  nextLesson: NavLesson | null;
  gender?: ProfileGender;
  onExit: () => void;
  onTaskToggle: (taskId: string, completed: boolean) => Promise<void>;
  onHabitToggle: (habitId: string, dayIndex: number, completed: boolean) => Promise<void>;
  onToggleComplete: () => void;
  isTogglingComplete: boolean;
}

function buildSlides(lesson: LessonDetail): LessonSlide[] {
  const slides: LessonSlide[] = [{ kind: 'intro', key: 'intro' }];

  const videoFiles = lesson.media_files.filter(
    (m) => m.video_provider !== null || m.file_type === 'video_url',
  );
  videoFiles.forEach((file, i) => {
    slides.push({ kind: 'video', key: `video-${file.id}`, mediaIndex: i });
  });

  const audioFiles = lesson.media_files.filter((m) => m.file_type === 'audio');
  audioFiles.forEach((file, i) => {
    slides.push({ kind: 'audio', key: `audio-${file.id}`, mediaIndex: i });
  });

  const textSections = splitLessonHtmlToSections(lesson.text_content ?? '');
  textSections.forEach((section, i) => {
    slides.push({
      kind: 'text',
      key: `text-${i}`,
      heading: section.heading,
      html: section.html,
    });
  });

  if (lesson.external_links.length > 0) {
    slides.push({ kind: 'links', key: 'links' });
  }
  if (lesson.tasks.length > 0) {
    slides.push({ kind: 'tasks', key: 'tasks' });
  }
  if (lesson.habits.length > 0) {
    slides.push({ kind: 'habits', key: 'habits' });
  }

  slides.push({ kind: 'outro', key: 'outro' });
  return slides;
}

export function LessonImmersivePath({
  lesson, progress, prevLesson, nextLesson, gender = null,
  onExit, onTaskToggle, onHabitToggle, onToggleComplete, isTogglingComplete,
}: LessonImmersivePathProps) {
  const slides = useMemo(() => buildSlides(lesson), [lesson]);
  const totalSlides = slides.length;
  const [slideIdx, setSlideIdx] = useState(0);
  const [direction, setDirection] = useState(1);

  const videoFiles = lesson.media_files.filter(
    (m) => m.video_provider !== null || m.file_type === 'video_url',
  );
  const audioFiles = lesson.media_files.filter((m) => m.file_type === 'audio');

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
  const current = slides[slideIdx];

  const slideEyebrow = current.kind === 'intro'
    ? 'פתיחת הפרק'
    : current.kind === 'outro'
      ? 'סיום הפרק'
      : current.kind === 'text'
        ? (current.heading ?? 'תוכן הפרק')
        : current.kind === 'video'
          ? 'וידאו'
          : current.kind === 'audio'
            ? 'אודיו'
            : current.kind === 'tasks'
              ? 'משימות'
              : current.kind === 'habits'
                ? 'הרגלים'
                : 'קישורים';

  return (
    <motion.div
      className="fixed inset-0 z-[75] flex flex-col overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{ width: '100vw', height: '100vh' }}
    >
      <div
        className="absolute inset-0"
        aria-hidden
        style={{ background: 'linear-gradient(160deg, #064e3b, #0f766e, #1f2937)' }}
      />
      <div
        className="absolute inset-0"
        aria-hidden
        style={{
          background:
            'linear-gradient(180deg, rgba(17,24,39,0.72) 0%, rgba(0,0,0,0.55) 50%, rgba(0,0,0,0.9) 100%)',
        }}
      />

      <div className="relative z-10 px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-2">
        <div className="mb-3 flex items-center gap-3">
          <GuideBackIconButton
            onClick={onExit}
            ariaLabel={lessonBackToReadLabel()}
            variant="immersive"
          />
          <div className="flex-1 min-w-0">
            <div className="mb-1 flex items-center justify-between text-[11px] font-bold text-white/60">
              <span className="inline-flex items-center gap-1 truncate">
                <Sparkles className="h-3 w-3 shrink-0 text-emerald-300" />
                {lessonImmersiveModeLabel()}
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
          eyebrow={slideEyebrow}
          title={lesson.title}
          subtitle={lesson.course.title}
        />
      </div>

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center overflow-y-auto px-6 py-2">
        <AnimatePresence mode="wait" custom={direction}>
          <LessonSlideContent
            key={current.key}
            slide={current}
            direction={direction}
            lesson={lesson}
            progress={progress}
            videoFiles={videoFiles}
            audioFiles={audioFiles}
            gender={gender}
            prevLesson={prevLesson}
            nextLesson={nextLesson}
            onToggleComplete={onToggleComplete}
            isTogglingComplete={isTogglingComplete}
            onTaskToggle={onTaskToggle}
            onHabitToggle={onHabitToggle}
          />
        </AnimatePresence>
      </div>

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

        <div className="flex max-w-[40%] flex-wrap items-center justify-center gap-1.5">
          {slides.map((s, i) => (
            <button
              key={s.key}
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
          <button
            type="button"
            onClick={onToggleComplete}
            disabled={isTogglingComplete}
            className="flex items-center gap-1.5 rounded-xl px-4 py-3 text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-60"
            style={{
              background: 'linear-gradient(135deg, #047857, #14b8a6)',
              boxShadow: '0 8px 24px rgba(20,184,166,0.35)',
            }}
          >
            <CheckCircle2 className="h-4 w-4" />
            {progress.is_completed ? 'הושלם' : 'סיום הפרק'}
          </button>
        )}
      </div>
    </motion.div>
  );
}

function LessonSlideContent({
  slide, direction, lesson, progress, videoFiles, audioFiles, gender,
  prevLesson, nextLesson, onToggleComplete, isTogglingComplete,
  onTaskToggle, onHabitToggle,
}: {
  slide: LessonSlide;
  direction: number;
  lesson: LessonDetail;
  progress: LessonProgressData;
  videoFiles: LessonDetail['media_files'];
  audioFiles: LessonDetail['media_files'];
  gender: ProfileGender;
  prevLesson: NavLesson | null;
  nextLesson: NavLesson | null;
  onToggleComplete: () => void;
  isTogglingComplete: boolean;
  onTaskToggle: (taskId: string, completed: boolean) => Promise<void>;
  onHabitToggle: (habitId: string, dayIndex: number, completed: boolean) => Promise<void>;
}) {
  const wrap = (children: React.ReactNode, className = 'w-full max-w-md') => (
    <motion.div
      custom={direction}
      variants={slideVariants}
      initial="enter"
      animate="center"
      exit="exit"
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );

  if (slide.kind === 'intro') {
    return wrap(
      <div className="text-center">
        <div className="mb-5 flex justify-center">
          <GuideImmersiveAlmogHero size={92} />
        </div>
        <h2 className="mb-3 text-3xl font-black leading-tight text-white" style={{ textShadow: '0 4px 24px rgba(0,0,0,0.5)' }}>
          {lesson.title}
        </h2>
        {lesson.description ? (
          <p className="mb-5 text-sm leading-relaxed text-white/75">{lesson.description}</p>
        ) : null}
        {lesson.duration_minutes ? (
          <p className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm text-white/80 backdrop-blur-md"
            style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.25)' }}>
            <Clock className="h-4 w-4 text-emerald-200" />
            {lesson.duration_minutes} דקות
          </p>
        ) : null}
        <p className="mt-6 text-xs font-semibold text-white/50">{lessonPathIntroHint(gender)}</p>
      </div>,
    );
  }

  if (slide.kind === 'text' && slide.html) {
    return wrap(
      <div className="guide-immersive-slide-card max-h-[55vh] overflow-y-auto rounded-3xl p-6">
        {slide.heading ? (
          <h3 className="mb-3 flex items-center gap-2 text-xl font-black text-white">
            <AlignLeft className="h-5 w-5 text-emerald-300" />
            {slide.heading}
          </h3>
        ) : null}
        <div
          className="lesson-content lesson-content-immersive text-sm leading-relaxed"
          dangerouslySetInnerHTML={{ __html: sanitizeLessonHtml(slide.html) }}
        />
      </div>,
      'w-full max-w-lg',
    );
  }

  if (slide.kind === 'video' && slide.mediaIndex !== undefined) {
    const file = videoFiles[slide.mediaIndex];
    if (!file) return null;
    return wrap(
      <div className="overflow-hidden rounded-2xl shadow-2xl">
        <VideoPlayer
          provider={file.video_provider!}
          externalId={file.video_external_id}
          externalUrl={file.video_external_url}
          title={lesson.title}
        />
      </div>,
      'w-full max-w-lg',
    );
  }

  if (slide.kind === 'audio' && slide.mediaIndex !== undefined) {
    const file = audioFiles[slide.mediaIndex];
    if (!file) return null;
    return wrap(
      <AudioPlayer
        src={file.uploadthing_url!}
        title={file.uploadthing_name ?? lesson.title}
        duration={file.duration_seconds}
      />,
      'w-full max-w-lg',
    );
  }

  if (slide.kind === 'links') {
    return wrap(
      <div className="guide-immersive-slide-card rounded-3xl p-5">
        <h3 className="mb-4 text-lg font-black text-white">קישורים נוספים</h3>
        <div className="space-y-2">
          {lesson.external_links.map((link) => (
            <a
              key={link.id}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-xl p-3 text-sm font-semibold text-white transition hover:bg-white/10"
              style={{ border: '1px solid rgba(255,255,255,0.2)' }}
            >
              <ExternalLinkIcon className="h-4 w-4 text-emerald-300" />
              {link.label}
            </a>
          ))}
        </div>
      </div>,
    );
  }

  if (slide.kind === 'tasks') {
    return wrap(
      <div className="guide-immersive-slide-card guide-immersive-tasks max-h-[55vh] overflow-y-auto rounded-3xl p-4">
        <TaskChecklist
          tasks={lesson.tasks}
          completedTaskIds={progress.task_progress}
          lessonId={lesson.id}
          onTaskToggle={onTaskToggle}
        />
      </div>,
      'w-full max-w-lg',
    );
  }

  if (slide.kind === 'habits') {
    return wrap(
      <div className="guide-immersive-slide-card guide-immersive-tasks max-h-[55vh] overflow-y-auto rounded-3xl p-4">
        <HabitTracker
          habits={lesson.habits}
          habitProgress={progress.habit_progress}
          lessonId={lesson.id}
          onHabitToggle={onHabitToggle}
        />
      </div>,
      'w-full max-w-lg',
    );
  }

  if (slide.kind === 'outro') {
    return wrap(
      <div className="text-center">
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.1, type: 'spring' }}
          className="mx-auto mb-5 inline-flex h-16 w-16 items-center justify-center rounded-full"
          style={{
            background: progress.is_completed
              ? 'linear-gradient(145deg, #10b981, #14b8a6)'
              : 'linear-gradient(145deg, rgba(99,102,241,0.5), rgba(20,184,166,0.4))',
            boxShadow: '0 12px 32px rgba(20,184,166,0.35)',
          }}
        >
          <CheckCircle2 className="h-8 w-8 text-white" />
        </motion.div>
        <h2 className="mb-2 text-2xl font-black text-white">
          {progress.is_completed ? 'כל הכבוד! סיימת את הפרק' : 'סיימת את מסע הפרק'}
        </h2>
        <p className="mb-5 text-sm text-white/70">
          {progress.is_completed ? 'אפשר להמשיך לפרק הבא או לחזור למדריך.' : 'סמן השלמה ותמשיך הלאה.'}
        </p>
        <div className="flex flex-col gap-2">
          {!progress.is_completed ? (
            <button
              type="button"
              onClick={onToggleComplete}
              disabled={isTogglingComplete}
              className="inline-flex items-center justify-center gap-2 rounded-2xl px-6 py-3.5 text-base font-black text-white disabled:opacity-60"
              style={{
                background: 'linear-gradient(135deg, #047857, #14b8a6)',
                boxShadow: '0 10px 30px rgba(20,184,166,0.35)',
              }}
            >
              <CheckCircle2 className="h-5 w-5" />
              סמן כהושלם
            </button>
          ) : null}
          {nextLesson ? (
            <Link
              href={lessonHrefWithViewMode(nextLesson.id, 'path')}
              className="inline-flex items-center justify-center gap-2 rounded-2xl px-6 py-3.5 text-base font-black text-white"
              style={{
                background: 'linear-gradient(135deg, #047857, #14b8a6)',
                boxShadow: '0 10px 30px rgba(20,184,166,0.35)',
              }}
            >
              <Play className="h-5 w-5" fill="white" />
              הפרק הבא
            </Link>
          ) : null}
          <Link
            href={`/guides/${lesson.course_id}`}
            className="inline-flex items-center justify-center gap-2 rounded-2xl px-6 py-3.5 text-sm font-bold text-white"
            style={{ background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.3)' }}
          >
            חזרה למדריך
          </Link>
          {prevLesson ? (
            <Link href={lessonHrefWithViewMode(prevLesson.id, 'path')} className="text-xs font-semibold text-white/50 hover:text-white/75">
              ← {prevLesson.title}
            </Link>
          ) : null}
        </div>
      </div>,
    );
  }

  return null;
}
