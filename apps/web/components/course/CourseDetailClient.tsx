'use client';

import Link from 'next/link';
import Image from 'next/image';
import { motion } from 'framer-motion';
import {
  Play, BookOpen, Clock, CheckCircle2, Lock,
  ChevronLeft, Award, Zap, Video, Headphones, FileText, Presentation, AlignLeft, Layers, Crown
} from 'lucide-react';
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
  text:         { icon: AlignLeft,                label: 'טקסט',      color: '#14b8a6' },
  pdf:          { icon: FileText,                 label: 'PDF',        color: '#ef4444' },
  presentation: { icon: Presentation,            label: 'מצגת',      color: '#a855f7' },
  mixed:        { icon: Layers,                   label: 'מגוון',     color: '#10b981' },
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

  return (
    <div className="min-h-screen bg-mesh-subtle">
      {/* Hero */}
      <div className="relative">
        <div className="relative h-48 md:h-64 overflow-hidden">
          {course.thumbnail_url ? (
            <Image
              src={course.thumbnail_url}
              alt={course.title}
              fill
              className="object-cover"
              priority
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-primary-800 via-primary-700 to-secondary-700" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
        </div>

        {/* Course info over hero */}
        <div className="container-mobile relative -mt-16 pb-0 px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              {course.is_premium && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold"
                  style={{ background: 'rgba(168,85,247,0.25)', border: '1px solid rgba(168,85,247,0.4)', color: '#e9d5ff' }}>
                  <Crown className="w-3 h-3" /> פרימיום
                </span>
              )}
              {isEnrolled && progress === 100 && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold"
                  style={{ background: 'rgba(16,185,129,0.25)', border: '1px solid rgba(16,185,129,0.4)', color: '#a7f3d0' }}>
                  <CheckCircle2 className="w-3 h-3" /> הושלם
                </span>
              )}
              {isEnrolled && progress > 0 && progress < 100 && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold"
                  style={{ background: 'rgba(20,184,166,0.2)', border: '1px solid rgba(20,184,166,0.35)', color: '#5eead4' }}>
                  <BookOpen className="w-3 h-3" /> בלמידה
                </span>
              )}
            </div>
            <h1 className="text-3xl font-black text-white mb-2 leading-tight">{course.title}</h1>
            {course.description && (
              <p className="text-slate-400 text-sm leading-relaxed mb-4">{course.description}</p>
            )}

            {/* Stats */}
            <div className="flex items-center gap-4 text-sm text-slate-400 mb-5">
              <div className="flex items-center gap-1.5">
                <BookOpen className="w-4 h-4 text-primary-400" />
                <span>{totalLessons} שיעורים</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-primary-400" />
                <span>~{totalMinutes} דקות</span>
              </div>
              {isEnrolled && (
                <div className="flex items-center gap-1.5">
                  <Award className="w-4 h-4 text-secondary-400" />
                  <span>{completedCount}/{totalLessons} הושלמו</span>
                </div>
              )}
            </div>

            {/* Progress */}
            {isEnrolled && progress > 0 && (
              <div className="mb-5">
                <div className="flex justify-between text-xs text-slate-400 mb-1.5">
                  <span>התקדמות</span>
                  <span className="font-bold text-primary-400">{progress}%</span>
                </div>
                <div className="progress-bar-lg">
                  <motion.div
                    className="absolute inset-y-0 right-0 rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.8, ease: 'easeOut', delay: 0.3 }}
                    style={{ background: 'linear-gradient(90deg, #10b981, #14b8a6, #2dd4bf)', boxShadow: '0 0 10px rgba(20,184,166,0.5)' }}
                  />
                </div>
              </div>
            )}

            {/* CTA Button */}
            {isEnrolled ? (
              firstIncompleteLessonId ? (
                <Link
                  href={`/lessons/${firstIncompleteLessonId}`}
                  className="btn-primary w-full justify-center mb-6 text-base py-4"
                >
                  <Play className="w-5 h-5" fill="white" />
                  {progress === 0 ? 'התחל ללמוד' : 'המשך ללמוד'}
                </Link>
              ) : (
                <div className="w-full text-center py-4 rounded-2xl font-bold text-secondary-300 mb-6 flex items-center justify-center gap-2"
                  style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', boxShadow: '0 0 20px rgba(16,185,129,0.1)' }}>
                  <Award className="w-5 h-5" />
                  כל הכבוד! סיימת את הקורס!
                </div>
              )
            ) : (
              <div className="w-full text-center py-4 rounded-2xl font-bold text-slate-400 mb-6 flex items-center justify-center gap-2"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
                <Lock className="w-4 h-4" />
                גישה תיפתח על ידי המנהל
              </div>
            )}
          </motion.div>
        </div>
      </div>

      {/* Lessons List */}
      <div className="container-mobile px-4 pb-8">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-1.5 h-7 rounded-full flex-shrink-0" style={{ background: 'linear-gradient(to bottom, #14FFEC, #10b981)' }} />
          <Zap className="w-4.5 h-4.5 text-primary-400" />
          <h2 className="text-lg font-black text-white">תוכן הקורס</h2>
          <span className="text-xs font-bold px-2.5 py-1 rounded-full mr-auto"
            style={{ background: 'rgba(20,184,166,0.15)', border: '1px solid rgba(20,184,166,0.25)', color: '#5eead4' }}>
            {course.lessons.length} שיעורים
          </span>
        </div>

        <motion.div variants={container} initial="hidden" animate="show" className="space-y-2">
          {course.lessons.map((lesson, idx) => {
            const config = typeConfig[lesson.lesson_type];
            const IconComp = config.icon;
            const isLocked = !isEnrolled;
            const isDone = lesson.is_completed;

            return (
              <motion.div key={lesson.id} variants={item}>
                {isEnrolled ? (
                  <Link
                    href={`/lessons/${lesson.id}`}
                    className={cn(
                      'card-lesson flex items-center gap-3 p-4',
                      isDone && 'completed'
                    )}
                  >
                    <LessonCardContent lesson={lesson} idx={idx} config={config} isDone={isDone} isLocked={false} />
                  </Link>
                ) : (
                  <div className="card-lesson flex items-center gap-3 p-4 opacity-60 cursor-not-allowed">
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
        <p className={cn('text-sm font-semibold line-clamp-1', isDone ? 'text-slate-400 line-through' : 'text-white')}>
          {lesson.title}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs font-medium" style={{ color: config.color }}>
            {config.label}
          </span>
          {lesson.duration_minutes && (
            <>
              <span className="text-slate-600 text-xs">·</span>
              <span className="text-xs text-slate-500">{lesson.duration_minutes} דק'</span>
            </>
          )}
        </div>
      </div>

      {/* Right icon */}
      {isLocked ? (
        <Lock className="w-4 h-4 text-slate-600 flex-shrink-0" />
      ) : isDone ? (
        <CheckCircle2 className="w-4 h-4 text-secondary-400 flex-shrink-0" />
      ) : (
        <ChevronLeft className="w-4 h-4 text-slate-600 flex-shrink-0" />
      )}
    </>
  );
}
