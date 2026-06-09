'use client';

import Link from 'next/link';
import Image from 'next/image';
import { motion } from 'framer-motion';
import {
  Play, BookOpen, Clock, CheckCircle2, Lock,
  ChevronLeft, Award, Zap, Video, Headphones, FileText, Presentation, AlignLeft, Layers, Crown
} from 'lucide-react';
import { AlmogScreenCoach } from '../ai/AlmogScreenCoach';
import { cn } from '../../lib/cn';

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
}

const lessonTypeConfig: Record<LessonItem['lesson_type'], { icon: React.ElementType; label: string; color: string }> = {
  video:        { icon: Video,                    label: 'וידאו',     color: '#6366f1' },
  audio:        { icon: Headphones,               label: 'אודיו',     color: '#f97316' },
  text:         { icon: AlignLeft,                label: 'טקסט',      color: '#0d9488' },
  pdf:          { icon: FileText,                 label: 'PDF',        color: '#ef4444' },
  presentation: { icon: Presentation,            label: 'מצגת',      color: '#a855f7' },
  mixed:        { icon: Layers,                   label: 'מגוון',     color: '#059669' },
};

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } },
};
const item = {
  hidden: { opacity: 0, x: 10 },
  show: { opacity: 1, x: 0, transition: { duration: 0.3 } },
};

export function CourseDetailClient({
  course, isEnrolled, progress, completedCount, firstIncompleteLessonId
}: CourseDetailClientProps) {
  const totalLessons = course.lessons.length;
  const totalMinutes = course.lessons.reduce((s, l) => s + (l.duration_minutes || 15), 0);
  const typeConfig = lessonTypeConfig;

  const bgUrl = course.background_image_url || course.thumbnail_url;

  return (
    <div className="min-h-screen guide-page-bg relative">
      {/* Hero header — the background image lives ONLY here */}
      <div className="guide-hero relative h-52 md:h-72">
        {bgUrl ? (
          <Image
            src={bgUrl}
            alt={course.title}
            fill
            className="object-cover"
            priority
          />
        ) : (
          <div className="guide-hero-fallback" aria-hidden />
        )}
        <div className="guide-hero-overlay" aria-hidden />

        {/* Title + meta over the hero image */}
        <div className="container-mobile absolute inset-x-0 bottom-0 px-4 pb-5">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              {course.is_premium && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold backdrop-blur-sm"
                  style={{ background: 'rgba(168,85,247,0.3)', border: '1px solid rgba(216,180,254,0.5)', color: '#f3e8ff' }}>
                  <Crown className="w-3 h-3" /> פרימיום
                </span>
              )}
              {isEnrolled && progress === 100 && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold backdrop-blur-sm"
                  style={{ background: 'rgba(16,185,129,0.32)', border: '1px solid rgba(167,243,208,0.5)', color: '#d1fae5' }}>
                  <CheckCircle2 className="w-3 h-3" /> הושלם
                </span>
              )}
              {isEnrolled && progress > 0 && progress < 100 && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold backdrop-blur-sm"
                  style={{ background: 'rgba(20,184,166,0.3)', border: '1px solid rgba(94,234,212,0.5)', color: '#ccfbf1' }}>
                  <BookOpen className="w-3 h-3" /> בלמידה
                </span>
              )}
            </div>
            <h1 className="text-3xl font-black text-white mb-2 leading-tight drop-shadow-md">{course.title}</h1>

            {/* Stats over hero */}
            <div className="flex items-center gap-4 text-sm text-white/90">
              <div className="flex items-center gap-1.5">
                <BookOpen className="w-4 h-4 text-emerald-200" />
                <span>{totalLessons} פרקים</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-emerald-200" />
                <span>~{totalMinutes} דקות</span>
              </div>
              {isEnrolled && (
                <div className="flex items-center gap-1.5">
                  <Award className="w-4 h-4 text-teal-100" />
                  <span>{completedCount}/{totalLessons} הושלמו</span>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      </div>

      {/* Light body */}
      <div className="container-mobile relative px-4 -mt-5">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.05 }}
        >
          {course.description && (
            <div className="guide-glass-card p-4 mb-4">
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

          <div className="mb-4">
            <AlmogScreenCoach
              title="אלמוג על המדריך הזה"
              body="אפשר לעצור רגע לפני שממשיכים: מה חשוב לקחת מהמדריך הזה, איפה להתחיל, ואיך לחבר אותו להרגלים שלך."
              prompt={`אלמוג, תעזור לי להבין איך להמשיך במדריך "${course.title}" ומה הפרק הכי נכון לי עכשיו.`}
              cta="דבר איתי על המדריך"
              tone="violet"
            />
          </div>

          {/* CTA Button */}
          {isEnrolled ? (
            firstIncompleteLessonId ? (
              <Link
                href={`/lessons/${firstIncompleteLessonId}`}
                className="w-full justify-center mb-6 text-base py-4 inline-flex items-center gap-2 rounded-2xl font-black text-white transition active:scale-[0.99]"
                style={{
                  background: 'linear-gradient(135deg, #6366f1 0%, #14b8a6 60%, #2dd4bf 100%)',
                  boxShadow: '0 10px 30px rgba(20,184,166,0.35), inset 0 1px 0 rgba(255,255,255,0.25)',
                }}
              >
                <Play className="w-5 h-5" fill="white" />
                {progress === 0 ? 'התחל ללמוד' : 'המשך ללמוד'}
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
        </motion.div>
      </div>

      {/* Chapters List */}
      <div className="container-mobile px-4 pb-8 relative z-10">
        <div className="guide-section-header">
          <span className="guide-section-bar" aria-hidden />
          <Zap className="w-4 h-4 text-emerald-600" />
          <h2>תוכן המדריך</h2>
          <span className="guide-glass-badge mr-auto">
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
                    href={`/lessons/${lesson.id}`}
                    className={cn(
                      'guide-glass-card flex items-center gap-3 p-4',
                      isDone && 'completed'
                    )}
                  >
                    <LessonCardContent lesson={lesson} idx={idx} config={config} isDone={isDone} isLocked={false} />
                  </Link>
                ) : (
                  <div className="guide-glass-card flex items-center gap-3 p-4 opacity-60 cursor-not-allowed">
                    <LessonCardContent lesson={lesson} idx={idx} config={config} isDone={false} isLocked={true} />
                  </div>
                )}
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </div>
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
      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-sm font-bold"
        style={isDone
          ? { background: 'rgba(16,185,129,0.2)', border: '1px solid rgba(16,185,129,0.4)', color: '#10b981' }
          : { background: `${config.color}22`, border: `1px solid ${config.color}44`, color: config.color }
        }>
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
