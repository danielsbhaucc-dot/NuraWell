'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { useProgressLiveRefresh } from '../../lib/journey/use-progress-live-refresh';
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
  History,
} from 'lucide-react';
import { TaskHistoryStrip } from '../tasks/TaskHistoryStrip';
import { TaskHistoryCalendar } from '../tasks/TaskHistoryCalendar';
import { DayDetailPopup, type DayExecRow } from '../tasks/DayDetailPopup';

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
  userId: string;
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
  /** פירוט ביצועים לפי יום — ל-Popup בלחיצה על עיגול */
  taskHistoryByDay?: Record<string, DayExecRow[]>;
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

/** כרטיס זכוכית ירוק-קרם — ללא #FFF */
const glassCardStyle = {
  borderRadius: 22,
  background:
    'linear-gradient(170deg, rgba(236,253,245,0.82) 0%, rgba(220,252,231,0.72) 55%, rgba(254,252,232,0.68) 100%)',
  border: '1px solid rgba(167,243,208,0.55)',
  boxShadow: '0 12px 40px rgba(6,78,59,0.08), inset 0 1px 0 rgba(236,253,245,0.9)',
  backdropFilter: 'blur(20px) saturate(1.2)',
  WebkitBackdropFilter: 'blur(20px) saturate(1.2)',
} as const;

function jerusalemTodayKey(): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

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
  userId,
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
  taskHistoryByDay = {},
}: ProgressPageClientProps) {
  const router = useRouter();
  const [popupDateKey, setPopupDateKey] = useState<string | null>(null);
  const todayKey = jerusalemTodayKey();

  /**
   * עדכון לייב: בכל שינוי ב-journey_progress / journey_task_executions של המשתמש —
   * מפעילים router.refresh() כדי שה-Server Component יישלף מחדש עם נתונים עדכניים.
   * ה-hook מבצע debounce של 800ms כדי שסימון רצוף של מספר סלוטים יבצע רענון אחד.
   */
  useProgressLiveRefresh(userId, () => router.refresh());

  const journeyPct =
    journeyStepsTotal > 0 ? Math.round((journeyStepsCompleted / journeyStepsTotal) * 100) : 0;
  const taskFollowPct =
    journeyTasksAccepted > 0 ? Math.round((journeyTasksReportedDone / journeyTasksAccepted) * 100) : 0;

  const historyDays = taskHistoryDays ?? [];
  const activeDaysCount = historyDays.filter((d) => d.t > 0 && d.c >= d.t).length;
  const partialDaysCount = historyDays.filter((d) => d.t > 0 && d.c > 0 && d.c < d.t).length;
  const showDailySection = historyDays.length > 0;

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
            <motion.div key={s.label} variants={item} style={glassCardStyle}
            className="p-3.5 flex flex-col gap-2"
          >
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
          style={glassCardStyle}
            className="p-4"
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
            <div
              className="rounded-2xl px-3 py-2.5 border border-emerald-200/40"
              style={{ background: 'rgba(220,252,231,0.55)' }}
            >
              <p className="text-[10px] font-bold text-gray-500 mb-0.5">צעדים הושלמו</p>
              <p className="text-lg font-black text-emerald-900">
                {journeyStepsCompleted}/{journeyStepsTotal || '—'}
              </p>
            </div>
            <div
              className="rounded-2xl px-3 py-2.5 border border-emerald-200/40"
              style={{ background: 'rgba(220,252,231,0.55)' }}
            >
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

        <motion.section
          variants={item}
          initial="hidden"
          animate="show"
          style={glassCardStyle}
            className="p-4 border-violet-200/40"
        >
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2 min-w-0">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.35)' }}
              >
                <History className="w-4 h-4 text-violet-800" strokeWidth={2.2} />
              </div>
              <div className="min-w-0 text-right">
                <h2 className="text-sm font-black text-[#1A1730]">היסטוריית משימות מפורטת</h2>
                <p className="text-[11px] text-gray-600 font-medium leading-relaxed">
                  מתי קיבלת · ביצוע ראשון · הצלחות ופספוסים לפי תאריך ושעה
                </p>
              </div>
            </div>
            <Link
              href="/progress/history"
              className="text-xs font-bold text-violet-900 shrink-0 px-3 py-1.5 rounded-full border border-violet-300/60 bg-violet-50/90"
            >
              פתח
            </Link>
          </div>
          <p className="text-[11px] text-gray-600 font-medium leading-relaxed">
            לכל משימה ש&quot;מקובלת עליי&quot; — ציר זמן מלא, רצפים, וסינון לפי יום / שבוע / חודש / שנה.
          </p>
        </motion.section>

        {showDailySection ? (
          <motion.section
            variants={item}
            initial="hidden"
            animate="show"
            style={glassCardStyle}
            className="p-4"
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
                  <h2 className="text-sm font-black text-emerald-950">המעקב היומי שלי</h2>
                  <p className="text-[11px] text-emerald-900/70 font-medium">
                    לחץ על יום לפירוט — 30 הימים האחרונים
                  </p>
                </div>
              </div>
              <span
                className="text-xs font-bold text-amber-900 shrink-0 px-3 py-1.5 rounded-full"
                style={{
                  background: 'rgba(254,243,199,0.65)',
                  border: '1px solid rgba(251,191,36,0.45)',
                }}
              >
                {activeDaysCount}/{historyDays.length}
              </span>
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-[10px] font-bold text-emerald-900/65 mb-1.5">השבוע האחרון</p>
                <TaskHistoryStrip
                  days={historyDays.slice(-7)}
                  todayKey={todayKey}
                  activeKey={popupDateKey}
                  onSelect={setPopupDateKey}
                />
              </div>

              <div>
                <p className="text-[10px] font-bold text-emerald-900/65 mb-1.5">חודש לאחור</p>
                <TaskHistoryCalendar
                  days={historyDays.slice(-28)}
                  todayKey={todayKey}
                  activeKey={popupDateKey}
                  onSelect={setPopupDateKey}
                />
              </div>

              <div className="flex flex-wrap items-center gap-2.5 pt-2 text-[10px] font-semibold text-emerald-900/75">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                  הושלם
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                  חלקי
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-sky-300" />
                  פתוח היום
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-rose-300/85" />
                  פספוס
                </span>
              </div>
              {partialDaysCount > 0 ? (
                <p
                  className="text-[10px] font-semibold text-emerald-900/75 text-right"
                  style={{
                    background: 'rgba(254,252,232,0.55)',
                    borderRadius: 10,
                    padding: '6px 10px',
                  }}
                >
                  {partialDaysCount} ימים עם ביצוע חלקי — כל צעד נחשב 🌱
                </p>
              ) : null}
            </div>
          </motion.section>
        ) : null}

        {currentStreak >= 3 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
            className="p-4 flex items-center gap-3 border-orange-200/60"
            style={{ ...glassCardStyle, background: 'rgba(254,243,199,0.45)' }}
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
                  <Link href={`/courses/${course.id}`} style={glassCardStyle}
            className="flex items-center gap-3 p-3.5 block"
          >
                    <div
                      className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 border border-emerald-200/50"
                      style={{ background: 'rgba(220,252,231,0.65)' }}
                    >
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
                      style={glassCardStyle}
            className="flex items-center gap-3 p-3 transition hover:opacity-90"
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
            style={glassCardStyle}
            className="text-center py-14 px-4"
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

      <DayDetailPopup
        open={Boolean(popupDateKey)}
        dateKey={popupDateKey}
        todayKey={todayKey}
        rows={popupDateKey ? (taskHistoryByDay[popupDateKey] ?? []) : []}
        onClose={() => setPopupDateKey(null)}
      />
    </div>
  );
}
