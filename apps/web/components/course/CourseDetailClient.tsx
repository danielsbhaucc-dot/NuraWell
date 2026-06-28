'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Play, BookOpen, Clock, CheckCircle2, Lock,
  ChevronLeft, ChevronRight, Award, Zap, Video, Headphones, FileText, Presentation, AlignLeft, Layers, Crown,
  Sparkles, AlignJustify,
} from 'lucide-react';
import { AlmogScreenCoach } from '../ai/AlmogScreenCoach';
import { GuideLearningPath } from './GuideLearningPath';
import { GuideBackIconButton } from './GuideBackIconButton';
import { cn } from '../../lib/cn';
import {
  persistGuideViewModePreference,
  type GuideViewMode,
} from '../../lib/client/guide-view-mode';
import {
  guideDetailAlmogBody,
  guideDetailAlmogTitle,
  guideLearnCta,
  GUIDE_IMMERSIVE_MODE_LABEL,
  guideCoverDivePrompt,
  guideCoverModeQuestion,
  guideBackToCoverLabel,
  guideChaptersSubtitle,
  type ProfileGender,
} from '../../lib/profile/personalized-copy';

interface LessonItem {
  id: string;
  title: string;
  description: string | null;
  lesson_type: 'video' | 'audio' | 'text' | 'pdf' | 'presentation' | 'mixed';
  sort_order: number;
  duration_minutes: number | null;
  is_completed: boolean;
}

interface CourseDetailClientProps {
  course: {
    id: string;
    title: string;
    description: string | null;
    thumbnail_url: string | null;
    background_image_url?: string | null;
    is_premium: boolean;
    lessons: LessonItem[];
  };
  isEnrolled: boolean;
  progress: number;
  completedCount: number;
  firstIncompleteLessonId: string | null;
  firstName?: string;
  gender?: ProfileGender;
  almogNote?: string | null;
}

const lessonTypeConfig: Record<LessonItem['lesson_type'], { icon: React.ElementType; label: string; color: string }> = {
  video:        { icon: Video,                    label: 'וידאו',     color: '#6366f1' },
  audio:        { icon: Headphones,               label: 'אודיו',     color: '#f97316' },
  text:         { icon: AlignLeft,                label: 'טקסט',      color: '#0d9488' },
  pdf:          { icon: FileText,                 label: 'PDF',        color: '#ef4444' },
  presentation: { icon: Presentation,            label: 'מצגת',      color: '#a855f7' },
  mixed:        { icon: Layers,                   label: 'מגוון',     color: '#059669' },
};

const CHAPTER_CARD_VARIANTS = [
  'guide-chapter-card--emerald',
  'guide-chapter-card--teal',
  'guide-chapter-card--indigo',
  'guide-chapter-card--amber',
  'guide-chapter-card--rose',
  'guide-chapter-card--violet',
] as const;

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } },
};
const item = {
  hidden: { opacity: 0, x: 10 },
  show: { opacity: 1, x: 0, transition: { duration: 0.3 } },
};

export function CourseDetailClient({
  course, isEnrolled, progress, completedCount, firstIncompleteLessonId,
  firstName = 'חבר', gender = null, almogNote = null,
}: CourseDetailClientProps) {
  const totalLessons = course.lessons.length;
  const totalMinutes = course.lessons.reduce((s, l) => s + (l.duration_minutes || 15), 0);
  const typeConfig = lessonTypeConfig;

  const bgUrl = course.background_image_url || course.thumbnail_url;

  type GuideViewModeLocal = 'cover' | 'read' | 'path';
  const [viewMode, setViewMode] = useState<GuideViewModeLocal>('cover');

  useEffect(() => {
    setViewMode('cover');
    window.scrollTo(0, 0);
  }, [course.id]);

  const setGuideMode = (mode: GuideViewMode) => {
    persistGuideViewModePreference(mode);
    setViewMode(mode);
  };

  const handleSelectMode = (mode: 'read' | 'path') => {
    setGuideMode(mode);
  };

  useEffect(() => {
    if (viewMode !== 'cover') return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [viewMode]);

  useEffect(() => () => {
    document.body.style.overflow = '';
  }, []);

  const showReadContent = viewMode === 'read';
  const lessonHref = (lessonId: string) => `/lessons/${lessonId}`;

  return (
    <>
      <div className="-mt-16">
    <div className={cn('guide-page-bg relative pb-8', showReadContent && 'guide-read-surface')}>
      {viewMode === 'read' && (
        <div className="container-mobile px-4 guide-back-to-cover-bar">
          <GuideBackIconButton
            onClick={() => setViewMode('cover')}
            ariaLabel={guideBackToCoverLabel()}
          />
        </div>
      )}
      {/* HERO header — large & premium; the background image lives ONLY here */}
      <div className="guide-hero relative h-[20rem] md:h-[28rem]">
        {bgUrl ? (
          <motion.div
            className="absolute inset-0"
            initial={{ scale: 1.05 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
          >
            <Image
              src={bgUrl}
              alt={course.title}
              fill
              className="object-cover"
              priority
            />
          </motion.div>
        ) : (
          <div className="guide-hero-fallback" aria-hidden />
        )}
        <div className="guide-hero-overlay" aria-hidden />
        <div className="guide-hero-scrim" aria-hidden />
        <div className="guide-hero-glow" aria-hidden />

        {/* Top pills row */}
        <div className="container-mobile absolute inset-x-0 top-0 z-[3] px-4 pt-5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-extrabold backdrop-blur-md"
              style={{ background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.35)', color: '#fff' }}>
              <BookOpen className="w-3.5 h-3.5" /> מדריך
            </span>
            {viewMode === 'read' && (
              <button
                type="button"
                onClick={() => setViewMode('cover')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-extrabold backdrop-blur-md transition hover:bg-white/25"
                style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff' }}
              >
                <Sparkles className="w-3.5 h-3.5" /> שער כניסה
              </button>
            )}
            {course.is_premium && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-extrabold backdrop-blur-md"
                style={{ background: 'rgba(168,85,247,0.32)', border: '1px solid rgba(216,180,254,0.55)', color: '#f3e8ff' }}>
                <Crown className="w-3.5 h-3.5" /> פרימיום
              </span>
            )}
            {isEnrolled && progress === 100 && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-extrabold backdrop-blur-md"
                style={{ background: 'rgba(16,185,129,0.34)', border: '1px solid rgba(167,243,208,0.55)', color: '#d1fae5' }}>
                <CheckCircle2 className="w-3.5 h-3.5" /> הושלם
              </span>
            )}
            {isEnrolled && progress > 0 && progress < 100 && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-extrabold backdrop-blur-md"
                style={{ background: 'rgba(20,184,166,0.32)', border: '1px solid rgba(94,234,212,0.55)', color: '#ccfbf1' }}>
                <BookOpen className="w-3.5 h-3.5" /> בלמידה
              </span>
            )}
          </div>
        </div>

        {/* Title + glass stats strip at the bottom */}
        <div className="container-mobile absolute inset-x-0 bottom-0 z-[3] px-4 pb-7">
          <div>
            <h1 className="text-4xl md:text-5xl font-black text-white mb-4 leading-[1.1] tracking-tight"
              style={{ textShadow: '0 4px 24px rgba(0,0,0,0.45)' }}>
              {course.title}
            </h1>

            <div className="guide-hero-stats guide-hero-stats--inline">
              <div className="guide-hero-stat">
                <BookOpen className="w-4 h-4 text-emerald-200 shrink-0" />
                <span className="font-bold text-white whitespace-nowrap">{totalLessons} פרקים</span>
              </div>
              <span className="guide-hero-stat-sep" aria-hidden />
              <div className="guide-hero-stat">
                <Clock className="w-4 h-4 text-emerald-200 shrink-0" />
                <span className="font-bold text-white whitespace-nowrap">~{totalMinutes} דקות</span>
              </div>
              {isEnrolled && (
                <>
                  <span className="guide-hero-stat-sep" aria-hidden />
                  <div className="guide-hero-stat">
                    <Award className="w-4 h-4 text-teal-100 shrink-0" />
                    <span className="font-bold text-white whitespace-nowrap">{completedCount}/{totalLessons} הושלמו</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Light body */}
      <div className="container-mobile relative px-4 -mt-6">
        <div>
          {showReadContent && <div className="guide-read-accent-strip" aria-hidden />}

          {course.description && (
            <div className={cn('guide-glass-card p-4 mb-4', showReadContent && 'guide-read-hero-card')}>
              <p className="text-sm leading-relaxed" style={{ color: '#3A3654' }}>{course.description}</p>
            </div>
          )}

          {/* Progress */}
          {isEnrolled && progress > 0 && (
            <div className="guide-glass-card p-4 mb-4">
              <div className="flex justify-between text-xs mb-1.5" style={{ color: '#6B6890' }}>
                <span className="font-semibold">התקדמות</span>
                <span className="font-black" style={{ color: '#047857' }}>{progress}%</span>
              </div>
              <div className="progress-bar-lg">
                <motion.div
                  className="absolute inset-y-0 right-0 rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.8, ease: 'easeOut', delay: 0.3 }}
                  style={{ background: 'linear-gradient(90deg, #10b981, #14b8a6, #2dd4bf)', boxShadow: '0 0 10px rgba(20,184,166,0.4)' }}
                />
              </div>
            </div>
          )}

          {/* Mode switcher */}
          <div className="guide-mode-switch mb-4">
            <button
              type="button"
              onClick={() => setGuideMode('read')}
              className={cn('guide-mode-btn', viewMode === 'read' && 'active')}
            >
              <AlignJustify className="h-4 w-4" />
              קריאה
            </button>
            <button
              type="button"
              onClick={() => setGuideMode('path')}
              className={cn('guide-mode-btn', viewMode === 'path' && 'active')}
            >
              <Sparkles className="h-4 w-4" />
              {GUIDE_IMMERSIVE_MODE_LABEL}
            </button>
          </div>

          <div className="mb-4">
            <AlmogScreenCoach
              title={guideDetailAlmogTitle(firstName)}
              body={guideDetailAlmogBody(gender, firstName, course.title, almogNote)}
              prompt={`תעזור לי להבין איך להמשיך במדריך "${course.title}" ומה הפרק הכי נכון לי עכשיו לפי ההתקדמות שלי.`}
              cta={gender === 'female' ? 'דברי איתי על המדריך' : gender === 'male' ? 'דבר איתי על המדריך' : 'דבר/י איתי על המדריך'}
              tone="teal"
            />
          </div>

          {/* CTA Button */}
          {isEnrolled ? (
            firstIncompleteLessonId ? (
              <Link
                href={lessonHref(firstIncompleteLessonId)}
                className="w-full justify-center mb-6 text-base py-4 inline-flex items-center gap-2 rounded-2xl font-black text-white transition active:scale-[0.99]"
                style={{
                  background: 'linear-gradient(135deg, #047857 0%, #14b8a6 60%, #2dd4bf 100%)',
                  boxShadow: '0 10px 30px rgba(20,184,166,0.35), inset 0 1px 0 rgba(255,255,255,0.25)',
                }}
              >
                <Play className="w-5 h-5" fill="white" />
                {guideLearnCta(gender, progress === 0)}
              </Link>
            ) : (
              <div className="w-full text-center py-4 rounded-2xl font-bold mb-6 flex items-center justify-center gap-2"
                style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', color: '#047857' }}>
                <Award className="w-5 h-5" />
                כל הכבוד! סיימת את המדריך!
              </div>
            )
          ) : (
            <div className="w-full text-center py-4 rounded-2xl font-bold mb-6 flex items-center justify-center gap-2"
              style={{ background: 'rgba(107,104,144,0.08)', border: '1px solid rgba(107,104,144,0.2)', color: '#6B6890' }}>
              <Lock className="w-4 h-4" />
              גישה תיפתח על ידי המנהל
            </div>
          )}
        </div>
      </div>

      {/* Chapters List */}
      <div className="container-mobile px-4 pb-8 relative z-10">
        <div className="guide-section-header">
          <span className="guide-section-bar" aria-hidden />
          <Zap className="w-4 h-4 text-emerald-600" />
          <div>
            <h2>תוכן המדריך</h2>
            <p className="text-xs font-semibold mt-0.5" style={{ color: '#6B6890' }}>
              {guideChaptersSubtitle(gender)}
            </p>
          </div>
          <span className="guide-glass-badge guide-section-badge">
            {course.lessons.length} פרקים
          </span>
        </div>

        <motion.div variants={container} initial="hidden" animate="show" className="space-y-2">
          {course.lessons.map((lesson, idx) => {
            const config = typeConfig[lesson.lesson_type];
            const isLocked = !isEnrolled;
            const isDone = lesson.is_completed;

            return (
              <motion.div key={lesson.id} variants={item}>
                {isEnrolled ? (
                  <Link
                    href={lessonHref(lesson.id)}
                    className={cn(
                      'guide-glass-card guide-chapter-card flex items-center gap-3 p-4',
                      CHAPTER_CARD_VARIANTS[idx % CHAPTER_CARD_VARIANTS.length],
                      isDone && 'completed'
                    )}
                  >
                    <LessonCardContent lesson={lesson} idx={idx} config={config} isDone={isDone} isLocked={false} />
                  </Link>
                ) : (
                  <div className={cn(
                    'guide-glass-card guide-chapter-card flex items-center gap-3 p-4 opacity-60 cursor-not-allowed',
                    CHAPTER_CARD_VARIANTS[idx % CHAPTER_CARD_VARIANTS.length],
                  )}>
                    <LessonCardContent lesson={lesson} idx={idx} config={config} isDone={false} isLocked={true} />
                  </div>
                )}
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </div>
      </div>

      <AnimatePresence>
        {viewMode === 'cover' ? (
          <GuideCover
            key="cover"
            title={course.title}
            bgUrl={bgUrl}
            totalLessons={totalLessons}
            totalMinutes={totalMinutes}
            isPremium={course.is_premium}
            progress={progress}
            isEnrolled={isEnrolled}
            gender={gender}
            onSelectMode={handleSelectMode}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {viewMode === 'path' ? (
          <GuideLearningPath
            key="learning-path"
            course={course}
            progress={progress}
            completedCount={completedCount}
            firstIncompleteLessonId={firstIncompleteLessonId}
            gender={gender}
            onExit={() => setViewMode('cover')}
          />
        ) : null}
      </AnimatePresence>
    </>
  );
}

/**
 * GuideCover — שער כניסה מלא-מסך (100vh/100vw): תמונת רקע עם שכבה כהה,
 * שם המדריך בפונט מרהיב, מידע טכני, וכפתור כניסה. בלחיצה הוא "נופל"
 * החוצה והעמוד נפתח מתחתיו בלי רענון.
 */
function GuideCover({
  title,
  bgUrl,
  totalLessons,
  totalMinutes,
  isPremium,
  progress,
  isEnrolled,
  gender,
  onSelectMode,
}: {
  title: string;
  bgUrl: string | null;
  totalLessons: number;
  totalMinutes: number;
  isPremium: boolean;
  progress: number;
  isEnrolled: boolean;
  gender: ProfileGender;
  onSelectMode: (mode: 'read' | 'path') => void;
}) {
  return (
    <motion.div
      className="fixed inset-0 z-[70] flex flex-col overflow-hidden"
      style={{ width: '100vw', height: '100vh' }}
      initial={{ opacity: 1 }}
      exit={{ y: '108%', opacity: 1, transition: { duration: 0.35, ease: [0.7, 0, 0.84, 0] } }}
    >
      {/* תמונת רקע */}
      {bgUrl ? (
        <motion.div
          className="absolute inset-0"
          initial={{ scale: 1.16 }}
          animate={{ scale: 1 }}
          transition={{ duration: 2.5, ease: 'easeOut' }}
        >
          <Image src={bgUrl} alt={title} fill className="object-cover" priority />
        </motion.div>
      ) : (
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(160deg, #064e3b, #0f766e, #1f2937)' }}
          aria-hidden
        />
      )}

      {/* שכבה כהה (שחור/אפור כהה) מעל התמונה */}
      <div
        className="absolute inset-0"
        aria-hidden
        style={{
          background:
            'linear-gradient(180deg, rgba(17,24,39,0.55) 0%, rgba(0,0,0,0.45) 45%, rgba(0,0,0,0.82) 100%)',
        }}
      />
      <div
        className="absolute inset-0"
        aria-hidden
        style={{ background: 'rgba(10,12,16,0.32)' }}
      />

      {/* תוכן השער */}
      <div className="relative z-10 flex flex-1 flex-col px-6 pt-[max(2rem,env(safe-area-inset-top))] guide-immersive-bottom-safe">
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="flex items-center gap-2"
        >
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-extrabold backdrop-blur-md"
            style={{ background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff' }}
          >
            <BookOpen className="h-3.5 w-3.5" /> מדריך
          </span>
          {isPremium ? (
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-extrabold backdrop-blur-md"
              style={{ background: 'rgba(168,85,247,0.3)', border: '1px solid rgba(216,180,254,0.5)', color: '#f3e8ff' }}
            >
              <Crown className="h-3.5 w-3.5" /> פרימיום
            </span>
          ) : null}
        </motion.div>

        {/* מרכז: שם המדריך בפונט מרהיב */}
        <div className="flex flex-1 flex-col items-center justify-center text-center pb-2">
          <motion.h1
            initial={{ opacity: 0, y: 24, letterSpacing: '0.06em' }}
            animate={{ opacity: 1, y: 0, letterSpacing: '-0.01em' }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
            className="max-w-[18ch] text-[44px] leading-[1.04] text-white sm:text-6xl"
            style={{
              fontFamily: "'Rubik','Heebo',sans-serif",
              fontWeight: 900,
              textShadow: '0 6px 40px rgba(0,0,0,0.6), 0 2px 10px rgba(0,0,0,0.5)',
            }}
          >
            {title}
          </motion.h1>
          <motion.span
            initial={{ opacity: 0, scaleX: 0 }}
            animate={{ opacity: 1, scaleX: 1 }}
            transition={{ duration: 0.6, delay: 0.55 }}
            className="mt-5 h-1 w-20 rounded-full"
            style={{ background: 'linear-gradient(90deg, #10b981, #2dd4bf)' }}
          />

          {/* מידע טכני */}
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.65 }}
            className="mt-6 flex flex-wrap items-center justify-center gap-2.5"
          >
            <CoverStat icon={BookOpen} value={`${totalLessons}`} label="פרקים" />
            <CoverStat icon={Clock} value={`~${totalMinutes}`} label="דקות" />
            {isEnrolled && progress > 0 ? (
              <CoverStat icon={Award} value={`${progress}%`} label="הושלם" />
            ) : null}
          </motion.div>
        </div>

        {/* בחירת מצב + כפתורי כניסה — גבוה יותר על המסך */}
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.75 }}
          className="-mt-24 mx-auto w-full max-w-sm space-y-3"
        >
          <p
            className="text-center text-lg font-black text-white"
            style={{ textShadow: '0 2px 12px rgba(0,0,0,0.4)' }}
          >
            {guideCoverDivePrompt(gender)}
          </p>
          <p className="text-center text-xs font-bold text-white/60">{guideCoverModeQuestion(gender)}</p>

          <motion.button
            type="button"
            onClick={() => onSelectMode('path')}
            whileTap={{ scale: 0.98 }}
            dir="rtl"
            className="flex w-full items-center justify-center gap-2.5 rounded-2xl py-4 text-base font-black text-white transition hover:brightness-110"
            style={{
              background: 'linear-gradient(135deg, #047857 0%, #14b8a6 60%, #2dd4bf 100%)',
              boxShadow: '0 14px 38px rgba(20,184,166,0.4), inset 0 1px 0 rgba(255,255,255,0.25)',
            }}
          >
            <Sparkles className="h-5 w-5 shrink-0" />
            <span>{GUIDE_IMMERSIVE_MODE_LABEL}</span>
          </motion.button>

          <motion.button
            type="button"
            onClick={() => onSelectMode('read')}
            whileTap={{ scale: 0.98 }}
            dir="rtl"
            className="flex w-full items-center justify-center gap-2.5 rounded-2xl border py-3.5 text-sm font-black text-white backdrop-blur-md transition hover:bg-white/10"
            style={{
              background: 'rgba(255,255,255,0.12)',
              borderColor: 'rgba(255,255,255,0.35)',
              boxShadow: '0 8px 24px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.18)',
            }}
          >
            <BookOpen className="h-4 w-4 shrink-0" />
            <span>קרא במדריך</span>
          </motion.button>

          <p className="pt-1 text-center text-[11px] font-semibold text-white/45">
            בחר מצב — תמיד אפשר לעבור ביניהם
          </p>
        </motion.div>
      </div>
    </motion.div>
  );
}

function CoverStat({
  icon: Icon,
  value,
  label,
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

function LessonCardContent({
  lesson, idx, config, isDone, isLocked
}: {
  lesson: LessonItem;
  idx: number;
  config: { icon: React.ElementType; label: string; color: string };
  isDone: boolean;
  isLocked: boolean;
}) {
  const IconComp = config.icon;
  return (
    <>
      {/* Number / Status */}
      <div
        className={cn('guide-chapter-index', isDone && 'opacity-80')}
        style={
          isDone
            ? { background: 'rgba(16,185,129,0.2)', borderColor: 'rgba(16,185,129,0.4)', color: '#10b981' }
            : undefined
        }
      >
        {isDone ? <CheckCircle2 className="w-4.5 h-4.5" /> : idx + 1}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={cn('text-sm font-semibold line-clamp-1', isDone ? 'line-through' : '')}
          style={{ color: isDone ? '#9896B8' : '#1A1730' }}>
          {lesson.title}
        </p>
        <div className="flex items-center gap-2 mt-1">
          <span
            className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full"
            style={{ color: config.color, background: `${config.color}1a`, border: `1px solid ${config.color}55` }}
          >
            <IconComp className="w-3 h-3" />
            {config.label}
          </span>
          {lesson.duration_minutes && (
            <span className="text-xs" style={{ color: '#9896B8' }}>{lesson.duration_minutes} דק&apos;</span>
          )}
        </div>
      </div>

      {/* Right icon */}
      {isLocked ? (
        <Lock className="w-4 h-4 flex-shrink-0" style={{ color: '#9896B8' }} />
      ) : isDone ? (
        <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
      ) : (
        <ChevronLeft className="w-4 h-4 flex-shrink-0" style={{ color: '#9896B8' }} />
      )}
    </>
  );
}
