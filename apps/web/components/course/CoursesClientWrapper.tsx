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
          background: '#EDF5F0',
          padding: '8px 16px 20px',
          minHeight: '55vh',
        }}
      >
        {enrolledCourses.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.05 }}
            className="flex gap-3.5 items-center mb-3.5 p-4"
            style={{
              background: 'linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(240,253,250,0.9) 100%)',
              backdropFilter: 'blur(20px)',
              border: '1px solid rgba(255,255,255,0.8)',
              borderRadius: '22px',
              boxShadow:
                '0 4px 24px rgba(6,78,59,0.10), 0 1px 4px rgba(6,78,59,0.06), inset 0 1px 0 rgba(255,255,255,1)',
            }}
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
                {stats.activeCoursesCount} קורסים פעילים
              </p>
              <p style={{ fontSize: '12px', color: '#9896B8', margin: '2px 0 8px' }}>
                {stats.totalLessonsCompleted} שיעורים הושלמו ✦
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
            title="אלמוג קורא איתך את הקורסים"
            body="לא בטוח במה להמשיך? אלמוג יכול להסתכל על ההתקדמות שלך ולעזור לבחור את השיעור שהכי מתאים לרגע הזה."
            prompt="אלמוג, תעזור לי לבחור באיזה קורס או שיעור להמשיך עכשיו לפי ההתקדמות שלי."
            cta="בחר איתי המשך"
            tone="amber"
          />
        </div>

        {enrolledCourses.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="flex items-center gap-3.5 mb-4 p-3.5 px-4"
            style={{
              background: 'linear-gradient(135deg, #FFF8E7 0%, #FFFBF0 100%)',
              border: '1.5px solid rgba(245,166,35,0.35)',
              borderRadius: '20px',
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
              <span style={{ fontSize: '8px', color: 'rgba(255,255,255,0.85)', fontWeight: 700 }}>קורסים</span>
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
              <p style={{ fontSize: '12px', color: '#B45309', marginTop: '2px' }}>יש שיעורים שמחכים לכם</p>
            </div>
          </motion.div>
        )}

        {enrolledCourses.length > 0 && (
          <section className="mb-6">
            <div
              style={{
                fontSize: '10px',
                fontWeight: 700,
                color: '#9896B8',
                letterSpacing: '1.2px',
                textTransform: 'uppercase',
                margin: '18px 0 12px 2px',
              }}
            >
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

        {availableCourses.length > 0 && (
          <section>
            <div
              style={{
                fontSize: '10px',
                fontWeight: 700,
                color: '#9896B8',
                letterSpacing: '1.2px',
                textTransform: 'uppercase',
                margin: '18px 0 12px 2px',
              }}
            >
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
              אין קורסים עדיין
            </h3>
            <p className="text-sm max-w-[220px] mx-auto leading-relaxed" style={{ color: '#9896B8' }}>
              המנהל יפתח עבורך גישה לקורסים בקרוב
            </p>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
