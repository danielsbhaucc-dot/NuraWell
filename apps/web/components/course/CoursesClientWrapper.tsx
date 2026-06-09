'use client';

import { motion } from 'framer-motion';
import { GraduationCap } from 'lucide-react';
import { AlmogScreenCoach } from '../ai/AlmogScreenCoach';
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

export function CoursesClientWrapper({ enrolledCourses, availableCourses, stats }: CoursesClientWrapperProps) {
  const isEmpty = enrolledCourses.length === 0 && availableCourses.length === 0;
  const totalSegments = enrolledCourses.length > 0 ? Math.max(enrolledCourses.length, 6) : 6;

  return (
    <motion.div className="pt-2">
      <div
        style={{
          background:
            'radial-gradient(circle at 0% 0%, rgba(99,102,241,0.10) 0%, transparent 42%),' +
            'radial-gradient(circle at 100% 8%, rgba(20,184,166,0.12) 0%, transparent 40%),' +
            'radial-gradient(circle at 50% 100%, rgba(245,166,35,0.10) 0%, transparent 45%),' +
            'linear-gradient(180deg, #F5F7FB 0%, #EEF3F2 100%)',
          padding: '8px 16px 28px',
          minHeight: '55vh',
        }}
      >
        {/* Page header */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="crystal-header rounded-2xl px-4 py-3.5 mb-4"
        >
          <h1 className="text-xl font-black text-white">המדריכים שלי</h1>
          <p className="text-sm text-white/80 mt-0.5">המשך ללמוד ולהתקדם</p>
        </motion.div>

        {enrolledCourses.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.05 }}
            className="crystal-surface flex gap-3.5 items-center mb-3.5 p-4 rounded-2xl"
          >
            <div
              className="flex-shrink-0 flex flex-col items-center justify-center"
              style={{
                width: '58px',
                height: '58px',
                background: 'linear-gradient(145deg, #047857, #10b981)',
                borderRadius: '18px',
                boxShadow: '0 4px 12px rgba(4,120,87,0.2)',
              }}
            >
              <span style={{ fontSize: '24px', fontWeight: 900, color: '#fff', lineHeight: 1 }}>
                {stats.avgProgress}
              </span>
              <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>%</span>
            </div>
            <div style={{ flex: 1 }}>
              <p
                style={{
                  fontSize: '15px',
                  fontWeight: 800,
                  color: '#1A1730',
                  fontFamily: "'Rubik','Heebo',sans-serif",
                }}
              >
                {stats.activeCoursesCount} מדריכים פעילים
              </p>
              <p style={{ fontSize: '12px', color: '#9896B8', margin: '2px 0 8px' }}>
                {stats.totalLessonsCompleted} פרקים הושלמו ✦
              </p>
              <div className="flex gap-1">
                {Array.from({ length: totalSegments }).map((_, i) => {
                  const course = enrolledCourses[i];
                  const isDone = course && course.progress === 100;
                  const isActive = course && course.progress > 0 && course.progress < 100;
                  return (
                    <div
                      key={i}
                      style={{
                        height: '6px',
                        flex: 1,
                        borderRadius: '10px',
                        background: isDone
                          ? 'linear-gradient(90deg, #14b8a6, #5eead4)'
                          : isActive
                            ? 'linear-gradient(90deg, #047857, #34d399)'
                            : 'rgba(0,0,0,0.08)',
                      }}
                    />
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}

        <div className="mb-4">
          <AlmogScreenCoach
            title="אלמוג קורא איתך את המדריכים"
            body="לא בטוח במה להמשיך? אלמוג יכול להסתכל על ההתקדמות שלך ולעזור לבחור את הפרק שהכי מתאים לרגע הזה."
            prompt="אלמוג, תעזור לי לבחור באיזה מדריך או פרק להמשיך עכשיו לפי ההתקדמות שלי."
            cta="בחר איתי המשך"
            tone="amber"
          />
        </div>

        {enrolledCourses.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="flex items-center gap-3.5 mb-4 p-3.5 px-4 rounded-2xl"
            style={{
              background: 'linear-gradient(135deg, #FFF8E7 0%, #FFFBF0 100%)',
              border: '1.5px solid rgba(245,166,35,0.35)',
              boxShadow: '0 4px 20px rgba(245,166,35,0.12), inset 0 1px 0 rgba(255,255,255,0.9)',
            }}
          >
            <div
              className="flex-shrink-0 flex flex-col items-center justify-center"
              style={{
                width: '50px',
                height: '50px',
                background: 'linear-gradient(145deg, #F5A623, #FBBF24)',
                borderRadius: '16px',
                boxShadow: '0 4px 14px rgba(245,166,35,0.45)',
              }}
            >
              <span style={{ fontSize: '20px', fontWeight: 900, color: 'white', lineHeight: 1 }}>
                {enrolledCourses.length}
              </span>
              <span style={{ fontSize: '8px', color: 'rgba(255,255,255,0.85)', fontWeight: 700 }}>מדריכים</span>
            </div>
            <div>
              <p
                style={{
                  fontSize: '14px',
                  fontWeight: 800,
                  color: '#78350F',
                  fontFamily: "'Rubik','Heebo',sans-serif",
                }}
              >
                ⚡ המשיכו ללמוד!
              </p>
              <p style={{ fontSize: '12px', color: '#B45309', marginTop: '2px' }}>יש פרקים שמחכים לכם</p>
            </div>
          </motion.div>
        )}

        {enrolledCourses.length > 0 && (
          <section className="mb-6">
            <SectionLabel text="בלמידה" gradient="linear-gradient(90deg, #4f46e5, #14b8a6)" />
            <motion.div variants={container} initial="hidden" animate="show" className="space-y-3.5">
              {enrolledCourses.map((course, i) => (
                <motion.div key={course.id} variants={item}>
                  <CourseCard course={course} progress={course.progress} isEnrolled={true} accentIndex={i} />
                </motion.div>
              ))}
            </motion.div>
          </section>
        )}

        {availableCourses.length > 0 && (
          <section>
            <SectionLabel text="מדריכים זמינים" gradient="linear-gradient(90deg, #f97316, #f5a623)" />
            <motion.div variants={container} initial="hidden" animate="show" className="space-y-3.5">
              {availableCourses.map((course, i) => (
                <motion.div key={course.id} variants={item}>
                  <CourseCard course={course} progress={0} isEnrolled={false} accentIndex={enrolledCourses.length + i} />
                </motion.div>
              ))}
            </motion.div>
          </section>
        )}

        {isEmpty && (
          <motion.div
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
            className="text-center py-20"
          >
            <div className="relative w-24 h-24 mx-auto mb-6">
              <div
                className="absolute inset-0 rounded-3xl"
                style={{
                  background: 'linear-gradient(145deg, #047857, #10b981)',
                  boxShadow: '0 8px 32px rgba(4,120,87,0.25)',
                }}
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <GraduationCap className="w-10 h-10 text-white" />
              </div>
            </div>
            <h3
              className="text-2xl font-black mb-2"
              style={{ color: '#1A1730', fontFamily: "'Rubik','Heebo',sans-serif" }}
            >
              אין מדריכים עדיין
            </h3>
            <p className="text-sm max-w-[220px] mx-auto leading-relaxed" style={{ color: '#9896B8' }}>
              המנהל יפתח עבורך גישה למדריכים בקרוב
            </p>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

function SectionLabel({ text, gradient }: { text: string; gradient: string }) {
  return (
    <div className="flex items-center gap-2.5" style={{ margin: '18px 0 12px 2px' }}>
      <span
        style={{
          width: '4px',
          height: '16px',
          borderRadius: '10px',
          background: gradient,
          flexShrink: 0,
        }}
      />
      <span
        style={{
          fontSize: '11px',
          fontWeight: 800,
          color: '#6B6890',
          letterSpacing: '1px',
        }}
      >
        {text}
      </span>
      <span style={{ flex: 1, height: '1px', background: 'linear-gradient(90deg, rgba(0,0,0,0.08), transparent)' }} />
    </div>
  );
}
