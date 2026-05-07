'use client';

import Link from 'next/link';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { Award, Clock, BookOpen, Flame, TrendingUp, CheckCircle2, Video, Headphones, FileText, AlignLeft, Layers, Presentation } from 'lucide-react';

interface CourseStatItem {
  id: string;
  title: string;
  thumbnail: string | null;
  total: number;
  completed: number;
  progress: number;
}

interface ActivityItem {
  lesson_id: string;
  lesson_title: string;
  lesson_type: string;
  completed_at: string;
}

interface ProgressPageClientProps {
  totalCompleted: number;
  totalEnrolled: number;
  totalTimeMinutes: number;
  currentStreak: number;
  courseStats: CourseStatItem[];
  recentActivity: ActivityItem[];
}

const lessonTypeIcon: Record<string, React.ElementType> = {
  video: Video,
  audio: Headphones,
  pdf: FileText,
  text: AlignLeft,
  mixed: Layers,
  presentation: Presentation,
};

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.07 } },
};
const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' } },
};

function formatTime(minutes: number): string {
  if (minutes < 60) return `${minutes} דק'`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}ש' ${m}ד'` : `${h} שעות`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return 'היום';
  if (diffDays === 1) return 'אתמול';
  if (diffDays < 7) return `לפני ${diffDays} ימים`;
  return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'short' });
}

export function ProgressPageClient({
  totalCompleted, totalEnrolled, totalTimeMinutes, currentStreak,
  courseStats, recentActivity
}: ProgressPageClientProps) {
  const stats = [
    { label: 'שיעורים הושלמו', value: totalCompleted, icon: CheckCircle2, color: '#10b981', bg: 'rgba(16,185,129,0.15)', border: 'rgba(16,185,129,0.3)' },
    { label: 'קורסים פעילים',  value: totalEnrolled,  icon: BookOpen,     color: '#14b8a6', bg: 'rgba(20,184,166,0.15)', border: 'rgba(20,184,166,0.3)' },
    { label: 'זמן למידה',      value: formatTime(totalTimeMinutes), icon: Clock, color: '#a855f7', bg: 'rgba(168,85,247,0.15)', border: 'rgba(168,85,247,0.3)' },
    { label: 'רצף ימים',       value: `${currentStreak}🔥`, icon: Flame, color: '#f97316', bg: 'rgba(249,115,22,0.15)', border: 'rgba(249,115,22,0.3)' },
  ];

  return (
    <div className="min-h-screen bg-mesh-subtle">
      <div className="container-mobile py-6 pb-8 space-y-6">

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
          <h1 className="text-2xl font-black text-white mb-1">ההתקדמות שלי 📊</h1>
          <p className="text-slate-400 text-sm">כל הנתונים על המסע שלך</p>
        </motion.div>

        {/* Stats Grid */}
        <motion.div
          variants={container} initial="hidden" animate="show"
          className="grid grid-cols-2 gap-3"
        >
          {stats.map((s) => (
            <motion.div key={s.label} variants={item}
              className="glass-card p-4 flex flex-col items-center text-center gap-2">
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center"
                style={{ background: s.bg, border: `1px solid ${s.border}` }}>
                <s.icon className="w-5 h-5" style={{ color: s.color }} />
              </div>
              <p className="text-2xl font-black text-white">{s.value}</p>
              <p className="text-xs text-slate-400 leading-tight">{s.label}</p>
            </motion.div>
          ))}
        </motion.div>

        {/* Streak Banner */}
        {currentStreak >= 3 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3 }}
            className="rounded-3xl p-4 flex items-center gap-3"
            style={{ background: 'linear-gradient(135deg, rgba(249,115,22,0.2), rgba(251,146,60,0.15))', border: '1px solid rgba(249,115,22,0.35)' }}
          >
            <span className="text-3xl streak-fire">🔥</span>
            <div>
              <p className="font-black text-white">רצף של {currentStreak} ימים!</p>
              <p className="text-xs text-orange-300">המשיכו כך - אתם מדהימים! 💪</p>
            </div>
          </motion.div>
        )}

        {/* Course Progress */}
        {courseStats.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 rounded-xl flex items-center justify-center"
                style={{ background: 'rgba(20,184,166,0.2)', border: '1px solid rgba(20,184,166,0.3)' }}>
                <TrendingUp className="w-4 h-4 text-primary-400" />
              </div>
              <h2 className="text-base font-bold text-white">התקדמות בקורסים</h2>
            </div>
            <motion.div variants={container} initial="hidden" animate="show" className="space-y-3">
              {courseStats.map((course) => (
                <motion.div key={course.id} variants={item}>
                  <Link href={`/courses/${course.id}`} className="card-premium flex items-center gap-3 p-4 block">
                    {/* Thumbnail */}
                    <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0"
                      style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
                      {course.thumbnail ? (
                        <Image src={course.thumbnail} alt={course.title} width={48} height={48} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <BookOpen className="w-5 h-5 text-slate-600" />
                        </div>
                      )}
                    </div>
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white line-clamp-1 mb-1">{course.title}</p>
                      <div className="progress-bar mb-1">
                        <motion.div
                          className="progress-bar-fill"
                          initial={{ width: 0 }}
                          animate={{ width: `${course.progress}%` }}
                          transition={{ duration: 0.7, ease: 'easeOut', delay: 0.2 }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-xs text-slate-500">
                        <span>{course.completed}/{course.total} שיעורים</span>
                        <span className="font-bold text-primary-400">{course.progress}%</span>
                      </div>
                    </div>
                  </Link>
                </motion.div>
              ))}
            </motion.div>
          </section>
        )}

        {/* Recent Activity */}
        {recentActivity.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 rounded-xl flex items-center justify-center"
                style={{ background: 'rgba(16,185,129,0.2)', border: '1px solid rgba(16,185,129,0.3)' }}>
                <Award className="w-4 h-4 text-secondary-400" />
              </div>
              <h2 className="text-base font-bold text-white">פעילות אחרונה</h2>
            </div>
            <motion.div variants={container} initial="hidden" animate="show" className="space-y-2">
              {recentActivity.map((a, idx) => {
                const IconComp = lessonTypeIcon[a.lesson_type] ?? AlignLeft;
                return (
                  <motion.div key={`${a.lesson_id}-${idx}`} variants={item}>
                    <Link
                      href={`/lessons/${a.lesson_id}`}
                      className="flex items-center gap-3 p-3 rounded-2xl transition-all hover:bg-white/5"
                      style={{ border: '1px solid rgba(255,255,255,0.06)' }}
                    >
                      <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)' }}>
                        <CheckCircle2 className="w-4 h-4 text-secondary-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-200 font-medium line-clamp-1">{a.lesson_title}</p>
                        <p className="text-xs text-slate-500 mt-0.5">✅ הושלם · {formatDate(a.completed_at)}</p>
                      </div>
                      <IconComp className="w-4 h-4 text-slate-600 flex-shrink-0" />
                    </Link>
                  </motion.div>
                );
              })}
            </motion.div>
          </section>
        )}

        {/* Empty State */}
        {totalCompleted === 0 && courseStats.length === 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center py-16"
          >
            <div className="text-5xl mb-4">🌱</div>
            <h3 className="text-xl font-bold text-white mb-2">המסע שלך מתחיל עכשיו</h3>
            <p className="text-slate-400 text-sm mb-6">השלם את השיעור הראשון שלך כדי לראות התקדמות</p>
            <Link href="/courses" className="btn-primary">
              לכל הקורסים 📚
            </Link>
          </motion.div>
        )}
      </div>
    </div>
  );
}
