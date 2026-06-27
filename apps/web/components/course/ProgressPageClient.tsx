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
  CalendarDays,
  ChevronLeft,
} from 'lucide-react';
import { TaskHistoryStrip } from '../tasks/TaskHistoryStrip';
import { TaskHistoryCalendar } from '../tasks/TaskHistoryCalendar';
import { DayDetailPopup, type DayExecRow } from '../tasks/DayDetailPopup';
import { WeightTrendInsightCard } from './WeightTrendInsightCard';
import { formatHebrewRelative } from '../../lib/time/hebrew-relative';

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
  /** דיווחי "ניסיתי ונכשלתי" באותו יום — לצביעה בסגול */
  a?: number;
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
  show: { opacity: 1, transition: { staggerChildren: 0.05 } },
};
const item = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.28, ease: 'easeOut' } },
};

const hebrewFont = "'Rubik','Heebo',sans-serif";

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

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="text-[15px] font-black text-[#1A1730] mb-3"
      style={{ fontFamily: hebrewFont }}
    >
      {children}
    </h2>
  );
}

function ProgressTrack({
  value,
  delay = 0,
  tone = 'primary',
}: {
  value: number;
  delay?: number;
  tone?: 'primary' | 'amber';
}) {
  const fill =
    tone === 'amber'
      ? 'linear-gradient(90deg, #d97706, #f59e0b)'
      : 'linear-gradient(90deg, #0f766e, #14b8a6)';

  return (
    <div className="h-1.5 rounded-full bg-black/[0.06] overflow-hidden">
      <motion.div
        className="h-full rounded-full"
        style={{ background: fill }}
        initial={{ width: 0 }}
        animate={{ width: `${value}%` }}
        transition={{ duration: 0.65, ease: 'easeOut', delay }}
      />
    </div>
  );
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
      label: 'פרקים הושלמו',
      value: String(totalCompleted),
      icon: CheckCircle2,
      iconBg: 'rgba(20,184,166,0.12)',
      iconColor: '#0f766e',
    },
    {
      label: 'מדריכים פעילים',
      value: String(totalEnrolled),
      icon: BookOpen,
      iconBg: 'rgba(99,102,241,0.10)',
      iconColor: '#6366f1',
    },
    {
      label: 'זמן למידה',
      value: formatTime(totalTimeMinutes),
      icon: Clock,
      iconBg: 'rgba(139,92,246,0.10)',
      iconColor: '#7c3aed',
    },
    {
      label: 'רצף ימים',
      value: `${currentStreak}`,
      suffix: 'ימים',
      icon: Flame,
      iconBg: 'rgba(249,115,22,0.10)',
      iconColor: '#ea580c',
    },
  ];

  return (
    <div className="min-h-full bg-dashboard">
      <div className="container-mobile py-6 pt-6 md:pt-16 pb-10 space-y-6">
        <motion.header
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="crystal-header rounded-3xl px-5 py-5 relative overflow-hidden"
        >
          <div
            className="absolute inset-0 opacity-30 pointer-events-none"
            style={{
              background: 'radial-gradient(circle at 80% 20%, rgba(255,255,255,0.35) 0%, transparent 55%)',
            }}
          />
          <div className="relative text-right">
            <p className="text-white/75 text-xs font-semibold mb-1">סטטוס כללי</p>
            <h1
              className="text-2xl font-black text-white tracking-tight"
              style={{ fontFamily: hebrewFont }}
            >
              ההתקדמות שלי
            </h1>
            <p className="mt-2 text-sm text-white/85 leading-relaxed max-w-sm">
              סיכום קצר של מה שעשית — בלי רעש, רק מה שחשוב
            </p>
          </div>
        </motion.header>

        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="grid grid-cols-2 gap-3"
        >
          {stats.map((s) => (
            <motion.div
              key={s.label}
              variants={item}
              className="crystal-stat rounded-2xl p-4 flex flex-col gap-2.5"
            >
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ background: s.iconBg }}
              >
                <s.icon className="w-[18px] h-[18px]" strokeWidth={2.2} style={{ color: s.iconColor }} />
              </div>
              <div>
                <p className="text-xl font-black text-[#1A1730] leading-none tabular-nums">
                  {s.value}
                  {'suffix' in s && s.suffix ? (
                    <span className="text-sm font-bold text-[#9896B8] mr-1">{s.suffix}</span>
                  ) : null}
                </p>
                <p className="text-[11px] font-semibold text-[#9896B8] mt-1">{s.label}</p>
              </div>
            </motion.div>
          ))}
        </motion.div>

        <WeightTrendInsightCard />

        <motion.section
          variants={item}
          initial="hidden"
          animate="show"
          className="crystal-surface rounded-2xl p-5"
        >
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="min-w-0 text-right flex-1">
              <div className="flex items-center gap-2 justify-end mb-1">
                <h2 className="text-[15px] font-black text-[#1A1730]" style={{ fontFamily: hebrewFont }}>
                  המסע שלי
                </h2>
                <div
                  className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: 'rgba(20,184,166,0.10)' }}
                >
                  <Route className="w-4 h-4 text-teal-700" strokeWidth={2.2} />
                </div>
              </div>
              <p className="text-xs text-[#9896B8] font-medium">
                {journeyStepsCompleted}/{journeyStepsTotal || '—'} צעדים
                {' · '}
                {journeyTasksReportedDone}/{journeyTasksAccepted || '0'} משימות שדווחו
              </p>
            </div>
            <Link
              href="/journey"
              className="inline-flex items-center gap-0.5 text-xs font-bold text-teal-800 shrink-0 px-3 py-1.5 rounded-full crystal-pill"
            >
              למסע
              <ChevronLeft className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <div className="flex justify-between text-[11px] font-semibold text-[#9896B8]">
                <span className="text-[#1A1730] tabular-nums">{journeyPct}%</span>
                <span>התקדמות במסע</span>
              </div>
              <ProgressTrack value={journeyPct} />
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-[11px] font-semibold text-[#9896B8]">
                <span className="text-[#1A1730] tabular-nums">{taskFollowPct}%</span>
                <span className="inline-flex items-center gap-1">
                  <ListChecks className="w-3.5 h-3.5 text-amber-600" />
                  ביצוע משימות שאישרת
                </span>
              </div>
              <ProgressTrack value={taskFollowPct} delay={0.08} tone="amber" />
            </div>
          </div>

          {journeyHabitChecks > 0 ? (
            <p className="mt-4 text-[11px] font-medium text-[#9896B8] text-right">
              סימוני הרגלים: {journeyHabitChecks}
            </p>
          ) : null}
        </motion.section>

        {showDailySection ? (
          <motion.section
            variants={item}
            initial="hidden"
            animate="show"
            className="crystal-surface rounded-2xl p-5"
          >
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="min-w-0 text-right flex-1">
                <div className="flex items-center gap-2 justify-end mb-1">
                  <h2 className="text-[15px] font-black text-[#1A1730]" style={{ fontFamily: hebrewFont }}>
                    מעקב יומי
                  </h2>
                  <div
                    className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: 'rgba(245,158,11,0.10)' }}
                  >
                    <CalendarDays className="w-4 h-4 text-amber-700" strokeWidth={2.2} />
                  </div>
                </div>
                <p className="text-xs text-[#9896B8] font-medium">
                  {activeDaysCount} ימים מלאים · 30 הימים האחרונים
                </p>
              </div>
              <Link
                href="/progress/history"
                className="inline-flex items-center gap-0.5 text-xs font-bold text-[#6366f1] shrink-0 px-3 py-1.5 rounded-full"
                style={{
                  background: 'rgba(99,102,241,0.08)',
                  border: '1px solid rgba(99,102,241,0.18)',
                }}
              >
                היסטוריה מפורטת
                <ChevronLeft className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="space-y-4">
              <div>
                <p className="text-[10px] font-bold text-[#9896B8] mb-2 text-right uppercase tracking-wide">
                  השבוע האחרון
                </p>
                <TaskHistoryStrip
                  days={historyDays.slice(-7)}
                  todayKey={todayKey}
                  activeKey={popupDateKey}
                  onSelect={setPopupDateKey}
                />
              </div>

              <div>
                <p className="text-[10px] font-bold text-[#9896B8] mb-2 text-right uppercase tracking-wide">
                  חודש לאחור
                </p>
                <TaskHistoryCalendar
                  days={historyDays.slice(-28)}
                  todayKey={todayKey}
                  activeKey={popupDateKey}
                  onSelect={setPopupDateKey}
                />
              </div>

              <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 pt-1 text-[10px] font-medium text-[#9896B8]">
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-teal-500" />
                  הושלם
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-amber-500" />
                  חלקי
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-violet-500" />
                  ניסיתי
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-sky-300" />
                  פתוח
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-rose-300" />
                  פספוס
                </span>
              </div>

              {partialDaysCount > 0 ? (
                <p className="text-[11px] font-medium text-[#9896B8] text-right">
                  {partialDaysCount} ימים עם ביצוע חלקי — כל צעד נחשב
                </p>
              ) : null}
            </div>
          </motion.section>
        ) : (
          <motion.section
            variants={item}
            initial="hidden"
            animate="show"
            className="crystal-surface rounded-2xl p-5 flex items-center justify-between gap-3"
          >
            <Link
              href="/progress/history"
              className="inline-flex items-center gap-0.5 text-xs font-bold text-[#6366f1] shrink-0 px-3 py-1.5 rounded-full"
              style={{
                background: 'rgba(99,102,241,0.08)',
                border: '1px solid rgba(99,102,241,0.18)',
              }}
            >
              פתח
              <ChevronLeft className="w-3.5 h-3.5" />
            </Link>
            <div className="min-w-0 text-right">
              <p className="text-sm font-black text-[#1A1730]">היסטוריית משימות</p>
              <p className="text-xs text-[#9896B8] mt-0.5">ציר זמן מפורט לפי תאריך ושעה</p>
            </div>
          </motion.section>
        )}

        {courseStats.length > 0 && (
          <section>
            <SectionTitle>מדריכים</SectionTitle>
            <motion.div variants={container} initial="hidden" animate="show" className="space-y-2.5">
              {courseStats.map((course) => (
                <motion.div key={course.id} variants={item}>
                  <Link
                    href={`/guides/${course.id}`}
                    className="crystal-surface rounded-2xl flex items-center gap-3 p-3.5 block transition hover:opacity-95"
                  >
                    <div className="w-11 h-11 rounded-xl overflow-hidden flex-shrink-0 bg-black/[0.04] border border-black/[0.04]">
                      {course.thumbnail ? (
                        <Image
                          src={course.thumbnail}
                          alt={course.title}
                          width={44}
                          height={44}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <BookOpen className="w-5 h-5 text-[#9896B8]" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0 text-right">
                      <p className="text-sm font-bold text-[#1A1730] line-clamp-1 mb-2">{course.title}</p>
                      <ProgressTrack value={course.progress} />
                      <div className="flex items-center justify-between text-[11px] text-[#9896B8] font-medium mt-1.5">
                        <span className="tabular-nums text-[#1A1730]">{course.progress}%</span>
                        <span>
                          {course.completed}/{course.total} פרקים
                        </span>
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
            <SectionTitle>פעילות אחרונה</SectionTitle>
            <motion.div variants={container} initial="hidden" animate="show" className="space-y-2">
              {recentActivity.map((a, idx) => {
                const IconComp = lessonTypeIcon[a.lesson_type] ?? AlignLeft;
                return (
                  <motion.div key={`${a.lesson_id}-${idx}`} variants={item}>
                    <Link
                      href={`/lessons/${a.lesson_id}`}
                      className="crystal-surface rounded-2xl flex items-center gap-3 p-3 transition hover:opacity-95"
                    >
                      <IconComp className="w-4 h-4 text-[#9896B8] flex-shrink-0" />
                      <div className="flex-1 min-w-0 text-right">
                        <p className="text-sm text-[#1A1730] font-semibold line-clamp-1">{a.lesson_title}</p>
                        <p className="text-[11px] text-[#9896B8] mt-0.5">
                          הושלם · {formatHebrewRelative(a.completed_at)}
                        </p>
                      </div>
                      <CheckCircle2 className="w-4 h-4 text-teal-600 flex-shrink-0" />
                    </Link>
                  </motion.div>
                );
              })}
            </motion.div>
          </section>
        )}

        {totalCompleted === 0 && courseStats.length === 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="crystal-surface rounded-2xl text-center py-12 px-5"
          >
            <div className="text-4xl mb-3">📊</div>
            <h3 className="text-lg font-black text-[#1A1730] mb-2" style={{ fontFamily: hebrewFont }}>
              כאן יופיע הסיכום שלך
            </h3>
            <p className="text-[#9896B8] text-sm mb-6 leading-relaxed max-w-xs mx-auto">
              התחל מפרק או מהמסע — והנתונים יתעדכנו כאן אוטומטית
            </p>
            <Link
              href="/home"
              className="inline-flex items-center justify-center px-6 py-3 rounded-2xl font-bold text-white crystal-header"
            >
              למדריכים
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
