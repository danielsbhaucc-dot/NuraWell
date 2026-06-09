'use client';

import Link from 'next/link';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { Play, Clock, BookOpen, CheckCircle2, Lock, Crown } from 'lucide-react';

interface CourseCardProps {
  course: {
    id: string;
    title: string;
    description: string | null;
    thumbnail_url: string | null;
    lessons: { id: string }[];
    is_premium: boolean;
    currentChapterTitle?: string | null;
    completedChapters?: number;
    totalChapters?: number;
  };
  progress: number;
  isEnrolled: boolean;
  /** אינדקס לבחירת ערכת צבע מגוונת */
  accentIndex?: number;
}

type Accent = {
  header: string;
  bar: string;
  barDone: string;
  strong: string;
  chipText: string;
  chipBg: string;
};

const ACCENTS: Accent[] = [
  {
    header: 'linear-gradient(145deg, #4f46e5 0%, #6366f1 50%, #818cf8 100%)',
    bar: 'linear-gradient(90deg, #4f46e5, #818cf8)',
    barDone: 'linear-gradient(90deg, #6366f1, #a5b4fc)',
    strong: '#4f46e5',
    chipText: '#4338ca',
    chipBg: 'rgba(99,102,241,0.12)',
  },
  {
    header: 'linear-gradient(145deg, #0d9488 0%, #14b8a6 50%, #2dd4bf 100%)',
    bar: 'linear-gradient(90deg, #0d9488, #2dd4bf)',
    barDone: 'linear-gradient(90deg, #14b8a6, #5eead4)',
    strong: '#0d9488',
    chipText: '#0f766e',
    chipBg: 'rgba(20,184,166,0.12)',
  },
  {
    header: 'linear-gradient(145deg, #ea580c 0%, #f97316 50%, #fb923c 100%)',
    bar: 'linear-gradient(90deg, #ea580c, #fb923c)',
    barDone: 'linear-gradient(90deg, #f97316, #fdba74)',
    strong: '#ea580c',
    chipText: '#c2410c',
    chipBg: 'rgba(249,115,22,0.12)',
  },
  {
    header: 'linear-gradient(145deg, #9333ea 0%, #a855f7 50%, #c084fc 100%)',
    bar: 'linear-gradient(90deg, #9333ea, #c084fc)',
    barDone: 'linear-gradient(90deg, #a855f7, #d8b4fe)',
    strong: '#9333ea',
    chipText: '#7e22ce',
    chipBg: 'rgba(168,85,247,0.12)',
  },
  {
    header: 'linear-gradient(145deg, #e11d48 0%, #f43f5e 50%, #fb7185 100%)',
    bar: 'linear-gradient(90deg, #e11d48, #fb7185)',
    barDone: 'linear-gradient(90deg, #f43f5e, #fda4af)',
    strong: '#e11d48',
    chipText: '#be123c',
    chipBg: 'rgba(244,63,94,0.12)',
  },
  {
    header: 'linear-gradient(145deg, #0284c7 0%, #0ea5e9 50%, #38bdf8 100%)',
    bar: 'linear-gradient(90deg, #0284c7, #38bdf8)',
    barDone: 'linear-gradient(90deg, #0ea5e9, #7dd3fc)',
    strong: '#0284c7',
    chipText: '#0369a1',
    chipBg: 'rgba(14,165,233,0.12)',
  },
];

export function CourseCard({ course, progress, isEnrolled, accentIndex = 0 }: CourseCardProps) {
  const lessonCount = course.lessons?.length || 0;
  const isCompleted = isEnrolled && progress === 100;
  const accent = ACCENTS[accentIndex % ACCENTS.length];

  return (
    <motion.div
      whileHover={{ y: -3, scale: 1.012 }}
      whileTap={{ scale: 0.975 }}
      transition={{ type: 'spring', stiffness: 380, damping: 26 }}
    >
      <Link
        href={`/guides/${course.id}`}
        className="block overflow-hidden no-tap-highlight relative"
        style={{
          borderRadius: '22px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.08), 0 1px 4px rgba(0,0,0,0.04)',
          transition: 'all 0.25s ease',
        }}
      >
        {/* ── Colored Gradient Header ── */}
        <div className="relative overflow-hidden" style={{
          background: isCompleted
            ? 'linear-gradient(145deg, #059669 0%, #10b981 50%, #34d399 100%)'
            : accent.header,
          padding: '18px 16px',
          display: 'flex', alignItems: 'center', gap: '14px',
        }}>
          {/* Shine sweep */}
          <div className="absolute pointer-events-none" style={{
            width: '60%', height: '100%', top: 0,
            background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.08) 50%, transparent 100%)',
            transform: 'skewX(-12deg)',
            animation: 'shineSweep 4s ease-in-out infinite',
          }} />

          {/* Icon wrap */}
          <div className="flex-shrink-0 flex items-center justify-center" style={{
            width: '48px', height: '48px',
            background: 'rgba(255,255,255,0.15)',
            border: '1px solid rgba(255,255,255,0.25)',
            borderRadius: '15px',
            backdropFilter: 'blur(8px)',
          }}>
            {course.thumbnail_url ? (
              <Image
                src={course.thumbnail_url}
                alt={course.title}
                width={48}
                height={48}
                className="object-cover"
                style={{ borderRadius: '14px', width: '100%', height: '100%' }}
              />
            ) : (
              <BookOpen className="w-6 h-6" style={{ color: 'rgba(255,255,255,0.9)' }} />
            )}
          </div>

          {/* Info */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.55)', fontWeight: 600, letterSpacing: '0.5px', marginBottom: '4px' }}>
              {lessonCount} פרקים · ~{lessonCount * 15} דקות
            </div>
            <div className="line-clamp-1" style={{ fontSize: '16px', fontWeight: 800, color: '#fff', fontFamily: "'Rubik','Heebo',sans-serif", lineHeight: 1.3 }}>
              {course.title}
            </div>
          </div>

          {/* Play / Lock button */}
          <div className="flex-shrink-0 flex items-center justify-center" style={{
            width: '42px', height: '42px',
            background: isEnrolled ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.2)',
            border: isEnrolled ? '1.5px solid rgba(255,255,255,0.35)' : '1.5px solid rgba(255,255,255,0.15)',
            borderRadius: '50%',
            backdropFilter: 'blur(8px)',
          }}>
            {isEnrolled ? (
              <Play className="w-4.5 h-4.5 text-white" style={{ marginRight: '-2px' }} fill="white" />
            ) : (
              <Lock className="w-4 h-4 text-white/60" />
            )}
          </div>

          {/* Top-right badges */}
          {(isCompleted || course.is_premium) && (
            <div className="absolute top-2.5 left-2.5 flex gap-1.5 z-10">
              {isCompleted && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold"
                  style={{ background: 'rgba(255,255,255,0.25)', backdropFilter: 'blur(6px)', color: '#ecfdf5' }}>
                  <CheckCircle2 className="w-3 h-3" /> הושלם
                </span>
              )}
              {course.is_premium && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold"
                  style={{ background: 'rgba(245,166,35,0.7)', backdropFilter: 'blur(6px)', color: '#fff' }}>
                  <Crown className="w-3 h-3" /> פרימיום
                </span>
              )}
            </div>
          )}
        </div>

        {/* ── White Footer ── */}
        <div style={{
          background: 'rgba(255,255,255,0.97)',
          padding: isEnrolled ? '10px 16px 14px' : '12px 16px',
          borderTop: '1px solid rgba(6,78,59,0.06)',
        }}>
          {/* Description line */}
          {course.description && (
            <p className="line-clamp-1" style={{ fontSize: '13px', color: '#5A5880', marginBottom: '8px', fontFamily: "'Heebo',sans-serif" }}>
              {course.description}
            </p>
          )}
          {isEnrolled && course.currentChapterTitle && !isCompleted && (
            <p className="line-clamp-1" style={{ fontSize: '12px', color: accent.strong, marginBottom: '6px', fontWeight: 600 }}>
              פרק נוכחי: {course.currentChapterTitle}
            </p>
          )}

          {/* Meta + status row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1" style={{ fontSize: '12px', color: '#9896B8' }}>
              <Clock className="w-3.5 h-3.5" style={{ color: '#9896B8' }} />
              <span><strong style={{ color: accent.strong }}>{lessonCount}</strong> פרקים</span>
            </div>
            {isEnrolled && !isCompleted && (
              <div style={{
                fontSize: '11px', fontWeight: 700,
                color: accent.chipText,
                background: accent.chipBg,
                padding: '4px 10px', borderRadius: '20px',
              }}>
                🔓 פתוח עכשיו
              </div>
            )}
            {isCompleted && (
              <div style={{
                fontSize: '11px', fontWeight: 700,
                color: '#059669',
                background: 'rgba(5,150,105,0.1)',
                padding: '4px 10px', borderRadius: '20px',
              }}>
                ✅ הושלם
              </div>
            )}
            {!isEnrolled && (
              <div style={{
                fontSize: '11px', fontWeight: 700,
                color: '#9896B8',
                background: 'rgba(0,0,0,0.05)',
                padding: '4px 10px', borderRadius: '20px',
              }}>
                🔒 נעול
              </div>
            )}
          </div>

          {/* Progress bar */}
          {isEnrolled && (
            <div style={{ marginTop: '10px' }}>
              <div className="flex justify-between items-center" style={{ marginBottom: '5px' }}>
                <span style={{ fontSize: '11px', fontWeight: 500, color: '#9896B8' }}>התקדמות</span>
                <span style={{ fontSize: '11px', fontWeight: 900, color: isCompleted ? '#059669' : accent.strong }}>{progress}%</span>
              </div>
              <div style={{ height: '6px', borderRadius: '10px', background: 'rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                <motion.div
                  style={{
                    height: '100%', borderRadius: '10px',
                    background: isCompleted ? accent.barDone : accent.bar,
                    boxShadow: 'none',
                  }}
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.8, ease: 'easeOut', delay: 0.15 }}
                />
              </div>
            </div>
          )}
        </div>
      </Link>
    </motion.div>
  );
}
