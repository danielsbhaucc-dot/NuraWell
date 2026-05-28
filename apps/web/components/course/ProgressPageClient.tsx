'use client';

import Link from 'next/link';
import Image from 'next/image';
import { motion } from 'framer-motion';
import {
  Clock,
  BookOpen,
  Flame,
  CheckCircle2,
  Video,
  Headphones,
  FileText,
  AlignLeft,
  Layers,
  Presentation,
  Route,
  ListChecks,
  Leaf,
  CalendarDays,
} from 'lucide-react';
import { TaskHistoryStrip } from '../tasks/TaskHistoryStrip';
import { TaskHistoryCalendar } from '../tasks/TaskHistoryCalendar';

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

interface TaskHistoryDay {
  d: string;
  c: number;
  t: number;
}

interface ProgressPageClientProps {
  totalCompleted: number;
  totalEnrolled: number;
  totalTimeMinutes: number;
  currentStreak: number;
  courseStats: CourseStatItem[];
  recentActivity: ActivityItem[];
  journeyStepsTotal: number;
  journeyStepsCompleted: number;
  journeyTasksAccepted: number;
  journeyTasksReportedDone: number;
  journeyHabitChecks: number;
  taskHistoryDays?: TaskHistoryDay[];
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
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
};
const item = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.32, ease: 'easeOut' } },
};

const glassCard =
  'rounded-[22px] border border-white/50 shadow-[0_12px_40px_rgba(6,78,59,0.08)] backdrop-blur-xl bg-white/55';

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
  totalCompleted,
  totalEnrolled,
  totalTimeMinutes,
  currentStreak,
  courseStats,
  recentActivity,
  journeyStepsTotal,
  journeyStepsCompleted,
  journeyTasksAccepted,
  journeyTasksReportedDone,
  journeyHabitChecks,
  taskHistoryDays,
}: ProgressPageClientProps) {
  const journeyPct =
    journeyStepsTotal > 0 ? Math.round((journeyStepsCompleted / journeyStepsTotal) * 100) : 0;
  const taskFollowPct =
    journeyTasksAccepted > 0 ? Math.round((journeyTasksReportedDone / journeyTasksAccepted) * 100) : 0;

  const historyDays = taskHistoryDays ?? [];
  const activeDaysCount = historyDays.filter((d) => d.c >= d.t).length;
  const hasHistorySignal = historyDays.some((d) => d.c > 0);

  const stats = [
    {
      label: 'שיעורים הושלמו',
      value: totalCompleted,
      icon: CheckCircle2,
      accent: 'text-emerald-700',
      iconBg: 'bg-emerald-100',
    },
    {
      label: 'קורסים פעילים',
      value: totalEnrolled,
      icon: BookOpen,
      accent: 'text-teal-700',
      iconBg: 'bg-teal-100',
    },
    {
      label: 'זמן למידה',
      value: formatTime(totalTimeMinutes),
      icon: Clock,
      accent: 'text-violet-700',
      iconBg: 'bg-violet-100',
    },
    {
      label: 'רצף ימים',
      value: `${currentStreak} ימים`,
      icon: Flame,
      accent: 'text-orange-700',
      iconBg: 'bg-orange-100',
    },
  ];

  return (
    <div className="min-h-screen pb-4" style={{ background: '#EDF5F0' }}>
      <div
        className="-mt-16 pt-16 pb-6 px-4"
        style={{ background: 'linear-gradient(160deg, #064e3b 0%, #047857 50%, #10b981 100%)' }}
      >
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
          <p className="text-white/75 text-xs font-semibold mb-1">סטטוס כללי</p>
          <h1 className="text-2xl font-black text-white mb-1" style={{ fontFamily: "'Rubik','Heebo',sans-serif" }}>
            ההתקדמות שלי
          </h1>
          <p className="text-white/85 text-sm max-w-md leading-relaxed">
            קורסים, מסע והרגלים — תמונה מלאה במקום אחד
          </p>
        </motion.div>
      </div>

      <div className="container-mobile -mt-4 space-y-5 relative z-[1]">
        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="grid grid-cols-2 gap-3"
        >
          {stats.map((s) => (
            <motion.div key={s.label} variants={item} className={`${glassCard} p-3.5 flex flex-col gap-2`}>
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${s.iconBg}`}>
                <s.icon className={`w-5 h-5 ${s.accent}`} strokeWidth={2.2} />
              </div>
              <p className={`text-xl font-black ${s.accent} leading-tight`}>{s.value}</p>
              <p className="text-[11px] font-semibold text-gray-600 leading-tight">{s.label}</p>
            </motion.div>
          ))}
        </motion.div>

        {/* מסע */}
        <motion.section
          variants={item}
          initial="hidden"
          animate="show"
          className={`${glassCard} p-4`}
        >
          <div className="flex items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2 min-w-0">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: 'rgba(16,185,129,0.2)', border: '1px solid rgba(16,185,129,0.35)' }}
              >
                <Route className="w-4 h-4 text-emerald-800" strokeWidth={2.2} />
              </div>
              <div className="min-w-0 text-right">
                <h2 className="text-sm font-black text-[#1A1730]">המסע שלי</h2>
                <p className="text-[11px] text-gray-600 font-medium">
                  צעדים, משימות מקובלות ודיווחי ביצוע
                </p>
              </div>
            </div>
            <Link
              href="/journey"
              className="text-xs font-bold text-emerald-800 shrink-0 px-3 py-1.5 rounded-full border border-emerald-300/60 bg-emerald-50/80"
            >
              למסע
            </Link>
          </div>

          <div className="grid grid-cols-2 gap-2.5 mb-4">
            <div className="rounded-2xl px-3 py-2.5 bg-white/70 border border-emerald-200/40">
              <p className="text-[10px] font-bold text-gray-500 mb-0.5">צעדים הושלמו</p>
              <p className="text-lg font-black text-emerald-900">
                {journeyStepsCompleted}/{journeyStepsTotal || '—'}
              </p>
            </div>
            <div className="rounded-2xl px-3 py-2.5 bg-white/70 border border-emerald-200/40">
              <p className="text-[10px] font-bold text-gray-500 mb-0.5">דיווח משימות</p>
              <p className="text-lg font-black text-emerald-900">
                {journeyTasksReportedDone}/{journeyTasksAccepted || '0'}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-[11px] font-bold text-gray-600">
              <span>התקדמות במסע</span>
              <span className="text-emerald-800">{journeyPct}%</span>
            </div>
            <div className="h-2 rounded-full bg-emerald-100 overflow-hidden border border-emerald-200/50">
              <motion.div
                className="h-full rounded-full"
                style={{ background: 'linear-gradient(90deg, #047857, #34d399)' }}
                initial={{ width: 0 }}
                animate={{ width: `${journeyPct}%` }}
                transition={{ duration: 0.7, ease: 'easeOut' }}
              />
            </div>
          </div>

          <div className="mt-4 space-y-2">
            <div className="flex justify-between text-[11px] font-bold text-gray-600">
              <span className="flex items-center gap-1">
                <ListChecks className="w-3.5 h-3.5 text-amber-600" />
                ביצוע משימות שאישרת
              </span>
              <span className="text-amber-900">{taskFollowPct}%</span>
            </div>
            <div className="h-2 rounded-full bg-amber-50 overflow-hidden border border-amber-200/40">
              <motion.div
                className="h-full rounded-full bg-gradient-to-l from-amber-400 to-amber-600"
                initial={{ width: 0 }}
                animate={{ width: `${taskFollowPct}%` }}
                transition={{ duration: 0.7, ease: 'easeOut', delay: 0.1 }}
              />
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2 justify-end text-xs font-semibold text-emerald-900/85 bg-emerald-50/80 border border-emerald-200/45 rounded-2xl px-3 py-2">
            <Leaf className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>סימוני הרגלים (מסך דיווח): {journeyHabitChecks}</span>
          </div>
        </motion.section>

        {hasHistorySignal && historyDays.length > 0 && (
          <motion.section
            variants={item}
            initial="hidden"
            animate="show"
            className={`${glassCard} p-4`}
          >
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-2 min-w-0">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: 'rgba(245,158,11,0.18)', border: '1px solid rgba(245,158,11,0.35)' }}
                >
                  <CalendarDays className="w-4 h-4 text-amber-700" strokeWidth={2.2} />
                </div>
                <div className="min-w-0 text-right">
                  <h2 className="text-sm font-black text-[#1A1730]">המעקב היומי שלי</h2>
                  <p className="text-[11px] text-gray-600 font-medium">
                    30 הימים האחרונים — ביצועי משימות מתועדים בלוח ירושלים
                  </p>
                </div>
              </div>
              <span className="text-xs font-bold text-amber-900 shrink-0 px-3 py-1.5 rounded-full border border-amber-300/60 bg-amber-50/80">
                {activeDaysCount}/{historyDays.length}
              </span>
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-[10px] font-bold text-gray-500 mb-1.5">השבוע האחרון</p>
                <TaskHistoryStrip days={historyDays.slice(-7)} />
              </div>

              <div>
                <p className="text-[10px] font-bold text-gray-500 mb-1.5">חודש לאחור</p>
                <TaskHistoryCalendar days={historyDays.slice(-28)} />
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-2 text-[10px] font-semibold text-gray-600">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                  פעיל
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                  חלקי
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
                  ללא דיווח
                </span>
              </div>
            </div>
          </motion.section>
        )}

        {currentStreak >= 3 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
            className={`${glassCard} p-4 flex items-center gap-3 border-orange-200/60 bg-orange-50/50`}
          >
            <span className="text-3xl">🔥</span>
            <div className="text-right min-w-0">
              <p className="font-black text-[#1A1730]">רצף של {currentStreak} ימים</p>
              <p className="text-xs text-orange-800/90 font-medium">המשך כך — זה בונה הרגל למידה</p>
            </div>
          </motion.div>
        )}

        {courseStats.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-3 px-0.5">
              <div className="w-1.5 h-6 rounded-full bg-gradient-to-b from-teal-400 to-emerald-700" />
              <h2 className="text-base font-black text-[#1A1730]">קורסים</h2>
            </div>
            <motion.div variants={container} initial="hidden" animate="show" className="space-y-3">
              {courseStats.map((course) => (
                <motion.div key={course.id} variants={item}>
                  <Link href={`/courses/${course.id}`} className={`${glassCard} flex items-center gap-3 p-3.5 block`}>
                    <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 border border-white/60 bg-white/80">
                      {course.thumbnail ? (
                        <Image
                          src={course.thumbnail}
                          alt={course.title}
                          width={48}
                          height={48}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <BookOpen className="w-5 h-5 text-gray-400" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0 text-right">
                      <p className="text-sm font-bold text-[#1A1730] line-clamp-1 mb-1">{course.title}</p>
                      <div className="h-1.5 rounded-full bg-emerald-100/90 overflow-hidden mb-1">
                        <motion.div
                          className="h-full rounded-full bg-gradient-to-l from-emerald-600 to-teal-400"
                          initial={{ width: 0 }}
                          animate={{ width: `${course.progress}%` }}
                          transition={{ duration: 0.65, ease: 'easeOut' }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-gray-600 font-semibold">
                        <span>
                          {course.completed}/{course.total} שיעורים
                        </span>
                        <span className="text-emerald-800">{course.progress}%</span>
                      </div>
                    </div>
                  </Link>
                </motion.div>
              ))}
            </motion.div>
          </section>
        )}

        {recentActivity.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-3 px-0.5">
              <div className="w-1.5 h-6 rounded-full bg-gradient-to-b from-amber-400 to-emerald-600" />
              <h2 className="text-base font-black text-[#1A1730]">פעילות אחרונה</h2>
            </div>
            <motion.div variants={container} initial="hidden" animate="show" className="space-y-2">
              {recentActivity.map((a, idx) => {
                const IconComp = lessonTypeIcon[a.lesson_type] ?? AlignLeft;
                return (
                  <motion.div key={`${a.lesson_id}-${idx}`} variants={item}>
                    <Link
                      href={`/lessons/${a.lesson_id}`}
                      className={`${glassCard} flex items-center gap-3 p-3 transition hover:bg-white/65`}
                    >
                      <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 bg-emerald-100 border border-emerald-200/50">
                        <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                      </div>
                      <div className="flex-1 min-w-0 text-right">
                        <p className="text-sm text-[#1A1730] font-bold line-clamp-1">{a.lesson_title}</p>
                        <p className="text-[11px] text-gray-600 mt-0.5 font-medium">
                          הושלם · {formatDate(a.completed_at)}
                        </p>
                      </div>
                      <IconComp className="w-4 h-4 text-gray-500 flex-shrink-0" />
                    </Link>
                  </motion.div>
                );
              })}
            </motion.div>
          </section>
        )}

        {totalCompleted === 0 && courseStats.length === 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            className={`${glassCard} text-center py-14 px-4`}
          >
            <div className="text-5xl mb-3">🌱</div>
            <h3 className="text-lg font-black text-[#1A1730] mb-2">המסע מתחיל כאן</h3>
            <p className="text-gray-600 text-sm mb-6 leading-relaxed">
              התחילו משיעור או מהמסע — ההתקדמות תופיע אוטומטית
            </p>
            <Link
              href="/home"
              className="inline-flex items-center justify-center px-6 py-3 rounded-2xl font-bold text-white"
              style={{
                background: 'linear-gradient(135deg, #047857, #10b981)',
                boxShadow: '0 8px 24px rgba(16,185,129,0.3)',
              }}
            >
              לקורסים
            </Link>
          </motion.div>
        )}
      </div>
    </div>
  );
}
