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
  };
  progress: number;
  isEnrolled: boolean;
}

export function CourseCard({ course, progress, isEnrolled }: CourseCardProps) {
  const lessonCount = course.lessons?.length || 0;
  const isCompleted = isEnrolled && progress === 100;

  return (
    <motion.div
      whileHover={{ y: -3, scale: 1.012 }}
      whileTap={{ scale: 0.975 }}
      transition={{ type: 'spring', stiffness: 380, damping: 26 }}
    >
      <Link
        href={`/courses/${course.id}`}
        className="block overflow-hidden no-tap-highlight relative"
        style={{
          borderRadius: '22px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.08), 0 1px 4px rgba(0,0,0,0.04)',
          transition: 'all 0.25s ease',
        }}
      >
        {/* ── Purple Gradient Header ── */}
        <div className="relative overflow-hidden" style={{
          background: isCompleted
            ? 'linear-gradient(145deg, #059669 0%, #10b981 50%, #34d399 100%)'
            : 'linear-gradient(145deg, #047857 0%, #059669 50%, #10b981 100%)',
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
              {lessonCount} שיעורים · ~{lessonCount * 15} דקות
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

          {/* Meta + status row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1" style={{ fontSize: '12px', color: '#9896B8' }}>
              <Clock className="w-3.5 h-3.5" style={{ color: '#9896B8' }} />
              <span><strong style={{ color: '#047857' }}>{lessonCount}</strong> שיעורים</span>
            </div>
            {isEnrolled && !isCompleted && (
              <div style={{
                fontSize: '11px', fontWeight: 700,
                color: '#0DBDB8',
                background: 'rgba(13,189,184,0.1)',
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
                <span style={{ fontSize: '11px', fontWeight: 900, color: isCompleted ? '#059669' : '#047857' }}>{progress}%</span>
              </div>
              <div style={{ height: '6px', borderRadius: '10px', background: 'rgba(6,78,59,0.08)', overflow: 'hidden' }}>
                <motion.div
                  style={{
                    height: '100%', borderRadius: '10px',
                    background: isCompleted
                      ? 'linear-gradient(90deg, #059669, #10b981, #34d399)'
                      : 'linear-gradient(90deg, #047857, #10b981, #34d399)',
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
