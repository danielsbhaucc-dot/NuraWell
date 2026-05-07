'use client';

import { motion } from 'framer-motion';
import { GraduationCap, BookOpen, TrendingUp, Award } from 'lucide-react';
import { CourseCard } from '../shared/CourseCard';
import type { CourseWithProgress, UserStats } from '../../lib/types/course';

interface CoursesClientWrapperProps {
  enrolledCourses: CourseWithProgress[];
  availableCourses: CourseWithProgress[];
  stats: UserStats;
}

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
};
const item = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.38, ease: 'easeOut' } },
};

const statCards = (stats: UserStats) => [
  {
    label: 'קורסים פעילים',
    value: stats.activeCoursesCount,
    icon: GraduationCap,
    color: '#10b981',
    glow: 'rgba(16,185,129,0.3)',
    bg: 'linear-gradient(135deg, rgba(16,185,129,0.18), rgba(4,120,87,0.08))',
    border: 'rgba(16,185,129,0.35)',
  },
  {
    label: 'שיעורים הושלמו',
    value: stats.totalLessonsCompleted,
    icon: Award,
    color: '#14b8a6',
    glow: 'rgba(20,184,166,0.25)',
    bg: 'linear-gradient(135deg, rgba(20,184,166,0.18), rgba(20,184,166,0.06))',
    border: 'rgba(20,184,166,0.35)',
  },
  {
    label: 'ממוצע התקדמות',
    value: `${stats.avgProgress}%`,
    icon: TrendingUp,
    color: '#f5a623',
    glow: 'rgba(245,166,35,0.28)',
    bg: 'linear-gradient(135deg, rgba(245,166,35,0.18), rgba(245,166,35,0.06))',
    border: 'rgba(245,166,35,0.35)',
  },
];

export function CoursesClientWrapper({ enrolledCourses, availableCourses, stats }: CoursesClientWrapperProps) {
  const isEmpty = enrolledCourses.length === 0 && availableCourses.length === 0;
  const totalSegments = enrolledCourses.length > 0 ? Math.max(enrolledCourses.length, 6) : 6;

  return (
    <div>
      {/* ═══ PURPLE HERO — extends behind fixed header ═══ */}
      <div className="-mt-16 pt-16 relative overflow-hidden"
        style={{ background: 'linear-gradient(160deg, #047857 0%, #059669 50%, #10b981 80%, #34d399 100%)' }}>
        {/* Orbs */}
        <div className="absolute pointer-events-none" style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(245,166,35,0.3) 0%, transparent 70%)', bottom: '20px', left: '50%', filter: 'blur(12px)' }} />

        <div className="relative z-10" style={{ padding: '12px 20px 40px' }}>
          {/* Avatar + Speech Bubble */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="flex items-end gap-3.5"
          >
            {/* Avatar with spinning ring */}
            <div className="relative flex-shrink-0">
              <div className="absolute rounded-full" style={{ inset: '-8px', background: 'conic-gradient(from 0deg, #14b8a6, #10b981, #f59e0b, #10b981, #14b8a6)', filter: 'blur(14px)', opacity: 0.55, zIndex: -1, animation: 'spinRing 6s linear infinite' }} />
              <div className="spin-ring" style={{
                width: '82px', height: '82px', borderRadius: '50%',
                background: 'conic-gradient(from 0deg, #14b8a6 0%, #10b981 30%, #f59e0b 55%, #10b981 75%, #14b8a6 100%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 4px 16px rgba(16,185,129,0.2)',
              }}>
                <div style={{ width: '74px', height: '74px', borderRadius: '50%', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3px' }}>
                  <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: 'linear-gradient(145deg, #047857, #059669)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '34px', overflow: 'hidden' }}>
                    🧑‍⚕️
                  </div>
                </div>
              </div>
              {/* Speaking pill */}
              <div style={{ position: 'absolute', bottom: '0px', left: '-2px', background: '#14b8a6', border: '2px solid white', borderRadius: '20px', padding: '3px 7px', display: 'flex', gap: '2px', alignItems: 'center', boxShadow: '0 2px 8px rgba(20,184,166,0.4)' }}>
                <span style={{ width: '3px', height: '3px', background: 'white', borderRadius: '50%', display: 'inline-block' }} />
                <span style={{ width: '3px', height: '3px', background: 'white', borderRadius: '50%', display: 'inline-block' }} />
                <span style={{ width: '3px', height: '3px', background: 'white', borderRadius: '50%', display: 'inline-block' }} />
              </div>
            </div>

            {/* Glass speech bubble */}
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.35, ease: [0.34, 1.56, 0.64, 1] }}
              style={{
                flex: 1, background: 'rgba(255,255,255,0.14)', backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)',
                border: '1px solid rgba(255,255,255,0.28)', borderRadius: '18px 18px 18px 6px', padding: '11px 14px',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.25), 0 4px 20px rgba(0,0,0,0.15)',
              }}
            >
              <div style={{ fontSize: '10px', color: '#A7F3D0', fontWeight: 700, letterSpacing: '0.5px', marginBottom: '4px' }}>✦ ד״ר לב — המנטור שלך</div>
              <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.92)', lineHeight: 1.55, fontWeight: 400, fontFamily: "'Heebo',sans-serif" }}>
                {enrolledCourses.length > 0
                  ? <>שלום! יש לנו שיעור חדש היום 🌿<br /><strong style={{ color: '#FFD97D', fontWeight: 700 }}>בואו נמשיך!</strong></>
                  : <>ברוכים הבאים! 🌿<br /><strong style={{ color: '#FFD97D', fontWeight: 700 }}>בואו נתחיל את המסע.</strong></>
                }
              </div>
            </motion.div>
          </motion.div>
        </div>
      </div>

      {/* ═══ WHITE ROUNDED SCROLL BODY ═══ */}
      <div style={{
        background: '#EDF5F0', borderRadius: '26px 26px 0 0', marginTop: '-18px',
        padding: '22px 16px 20px', position: 'relative', zIndex: 3, minHeight: '55vh',
      }}>

        {/* ── Progress Card ── */}
        {enrolledCourses.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.05 }}
            className="flex gap-3.5 items-center mb-3.5 p-4"
            style={{
              background: 'linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(240,253,250,0.9) 100%)',
              backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.8)', borderRadius: '22px',
              boxShadow: '0 4px 24px rgba(6,78,59,0.10), 0 1px 4px rgba(6,78,59,0.06), inset 0 1px 0 rgba(255,255,255,1)',
            }}
          >
            {/* Day pill */}
            <div className="flex-shrink-0 flex flex-col items-center justify-center"
              style={{ width: '58px', height: '58px', background: 'linear-gradient(145deg, #047857, #10b981)', borderRadius: '18px', boxShadow: '0 4px 12px rgba(4,120,87,0.2)' }}>
              <span style={{ fontSize: '24px', fontWeight: 900, color: '#fff', lineHeight: 1 }}>{stats.avgProgress}</span>
              <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>%</span>
            </div>
            {/* Progress info */}
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: '15px', fontWeight: 800, color: '#1A1730', fontFamily: "'Rubik','Heebo',sans-serif" }}>
                {stats.activeCoursesCount} קורסים פעילים
              </p>
              <p style={{ fontSize: '12px', color: '#9896B8', margin: '2px 0 8px' }}>
                {stats.totalLessonsCompleted} שיעורים הושלמו ✦
              </p>
              {/* Segments */}
              <div className="flex gap-1">
                {Array.from({ length: totalSegments }).map((_, i) => {
                  const course = enrolledCourses[i];
                  const isDone = course && course.progress === 100;
                  const isActive = course && course.progress > 0 && course.progress < 100;
                  return (
                    <div key={i} style={{
                      height: '6px', flex: 1, borderRadius: '10px',
                      background: isDone
                        ? 'linear-gradient(90deg, #14b8a6, #5eead4)'
                        : isActive
                          ? 'linear-gradient(90deg, #047857, #34d399)'
                          : 'rgba(0,0,0,0.08)',
                    }} />
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}

        {/* ── Badge / Reminder Card ── */}
        {enrolledCourses.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="flex items-center gap-3.5 mb-4 p-3.5 px-4"
            style={{
              background: 'linear-gradient(135deg, #FFF8E7 0%, #FFFBF0 100%)',
              border: '1.5px solid rgba(245,166,35,0.35)', borderRadius: '20px',
              boxShadow: '0 4px 20px rgba(245,166,35,0.12), inset 0 1px 0 rgba(255,255,255,0.9)',
            }}
          >
            <div className="flex-shrink-0 flex flex-col items-center justify-center"
              style={{ width: '50px', height: '50px', background: 'linear-gradient(145deg, #F5A623, #FBBF24)', borderRadius: '16px', boxShadow: '0 4px 14px rgba(245,166,35,0.45)' }}>
              <span style={{ fontSize: '20px', fontWeight: 900, color: 'white', lineHeight: 1 }}>{enrolledCourses.length}</span>
              <span style={{ fontSize: '8px', color: 'rgba(255,255,255,0.85)', fontWeight: 700 }}>קורסים</span>
            </div>
            <div>
              <p style={{ fontSize: '14px', fontWeight: 800, color: '#78350F', fontFamily: "'Rubik','Heebo',sans-serif" }}>⚡ המשיכו ללמוד!</p>
              <p style={{ fontSize: '12px', color: '#B45309', marginTop: '2px' }}>יש שיעורים שמחכים לכם</p>
            </div>
          </motion.div>
        )}

        {/* ── Section: Enrolled Courses ── */}
        {enrolledCourses.length > 0 && (
          <section className="mb-6">
            <div style={{ fontSize: '10px', fontWeight: 700, color: '#9896B8', letterSpacing: '1.2px', textTransform: 'uppercase', margin: '18px 0 12px 2px' }}>
              בלמידה
            </div>
            <motion.div variants={container} initial="hidden" animate="show" className="space-y-3.5">
              {enrolledCourses.map((course) => (
                <motion.div key={course.id} variants={item}>
                  <CourseCard course={course} progress={course.progress} isEnrolled={true} />
                </motion.div>
              ))}
            </motion.div>
          </section>
        )}

        {/* ── Section: Available Courses ── */}
        {availableCourses.length > 0 && (
          <section>
            <div style={{ fontSize: '10px', fontWeight: 700, color: '#9896B8', letterSpacing: '1.2px', textTransform: 'uppercase', margin: '18px 0 12px 2px' }}>
              קורסים זמינים
            </div>
            <motion.div variants={container} initial="hidden" animate="show" className="space-y-3.5">
              {availableCourses.map((course) => (
                <motion.div key={course.id} variants={item}>
                  <CourseCard course={course} progress={0} isEnrolled={false} />
                </motion.div>
              ))}
            </motion.div>
          </section>
        )}

        {/* ── Empty State ── */}
        {isEmpty && (
          <motion.div
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
            className="text-center py-20"
          >
            <div className="relative w-24 h-24 mx-auto mb-6">
              <div className="absolute inset-0 rounded-3xl"
                style={{ background: 'linear-gradient(145deg, #047857, #10b981)', boxShadow: '0 8px 32px rgba(4,120,87,0.25)' }} />
              <div className="absolute inset-0 flex items-center justify-center">
                <GraduationCap className="w-10 h-10 text-white" />
              </div>
            </div>
            <h3 className="text-2xl font-black mb-2" style={{ color: '#1A1730', fontFamily: "'Rubik','Heebo',sans-serif" }}>אין קורסים עדיין</h3>
            <p className="text-sm max-w-[220px] mx-auto leading-relaxed" style={{ color: '#9896B8' }}>
              המנהל יפתח עבורך גישה לקורסים בקרוב
            </p>
          </motion.div>
        )}
      </div>
    </div>
  );
}
