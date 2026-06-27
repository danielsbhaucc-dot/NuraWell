'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
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
  LineChart,
  Sparkles,
} from 'lucide-react';
import { TaskHistoryStrip } from '../tasks/TaskHistoryStrip';
import { TaskHistoryCalendar } from '../tasks/TaskHistoryCalendar';
import { DayDetailPopup, type DayExecRow } from '../tasks/DayDetailPopup';
import { WeightTrendInsightCard } from './WeightTrendInsightCard';
import { AlmogAvatarChipWithNameTag } from '../journey/AlmogPresence';
import { formatHebrewRelative } from '../../lib/time/hebrew-relative';
import { getPersonalGreeting } from '../../lib/time/greeting';
import {
  progressPageAlmogHeroBody,
  progressPageGreeting,
  progressPartialDaysMessage,
  progressStatsSectionSubtitle,
  type ProfileGender,
} from '../../lib/profile/personalized-copy';

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
  firstName?: string;
  gender?: ProfileGender;
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

type StripeTone = 'teal' | 'indigo' | 'emerald' | 'amber';

function ProgressSectionHeader({
  title,
  subtitle,
  tone,
  icon: Icon,
}: {
  title: string;
  subtitle?: string;
  tone: StripeTone;
  icon?: React.ElementType;
}) {
  return (
    <div className="progress-section-header">
      <span className={`progress-section-stripe progress-section-stripe-${tone}`} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {Icon ? (
            <span
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
              style={{
                background:
                  tone === 'teal'
                    ? 'rgba(20,184,166,0.12)'
                    : tone === 'indigo'
                      ? 'rgba(99,102,241,0.10)'
                      : tone === 'amber'
                        ? 'rgba(245,158,11,0.12)'
                        : 'rgba(16,185,129,0.10)',
              }}
            >
              <Icon
                className="h-3.5 w-3.5"
                strokeWidth={2.2}
                style={{
                  color:
                    tone === 'teal'
                      ? '#0f766e'
                      : tone === 'indigo'
                        ? '#6366f1'
                        : tone === 'amber'
                          ? '#d97706'
                          : '#059669',
                }}
              />
            </span>
          ) : null}
          <h2
            className="text-[15px] font-black text-[#1A1730] leading-tight"
            style={{ fontFamily: hebrewFont }}
          >
            {title}
          </h2>
        </div>
        {subtitle ? (
          <p className="mt-0.5 text-xs font-medium text-[#9896B8] leading-relaxed">{subtitle}</p>
        ) : null}
      </div>
    </div>
  );
}

function ProgressSectionDivider({ tone }: { tone: StripeTone }) {
  return <hr className={`progress-section-divider progress-section-divider-${tone}`} aria-hidden />;
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

export function ProgressPageClient({
  userId,
  firstName = 'חבר',
  gender = null,
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
  const greeting = useMemo(() => getPersonalGreeting(new Date()), []);
  const heroSeed = useMemo(
    () => new Date().getDate() + currentStreak + totalCompleted,
    [currentStreak, totalCompleted]
  );
  const almogHeroBody = progressPageAlmogHeroBody(gender, firstName, heroSeed);

  useProgressLiveRefresh(userId, () => router.refresh());

  const journeyPct =
    journeyStepsTotal > 0 ? Math.round((journeyStepsCompleted / journeyStepsTotal) * 100) : 0;
  const taskFollowPct =
    journeyTasksAccepted > 0 ? Math.round((journeyTasksReportedDone / journeyTasksAccepted) * 100) : 0;

  const historyDays = taskHistoryDays ?? [];
  const activeDaysCount = historyDays.filter((d) => d.t > 0 && d.c >= d.t).length;
  const partialDaysCount = historyDays.filter((d) => d.t > 0 && d.c > 0 && d.c < d.t).length;
  const showDailySection = historyDays.length > 0;
  const partialDaysMessage = progressPartialDaysMessage(partialDaysCount);

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
    <div className="min-h-full bg-dashboard" dir="rtl">
      <motion.header
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="-mt-16 relative overflow-hidden pt-16"
        style={{
          background:
            'linear-gradient(155deg, #034d3a 0%, #059669 35%, #0d9488 65%, #10b981 85%, #34d399 100%)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2)',
          isolation: 'isolate',
        }}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-2/3"
          style={{
            background: 'linear-gradient(180deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0) 100%)',
          }}
        />
        <span
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-12 h-48 w-48 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.28), transparent 68%)' }}
        />
        <span
          aria-hidden
          className="pointer-events-none absolute -bottom-10 -left-16 h-56 w-56 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(45,212,191,0.45), transparent 70%)' }}
        />

        <div className="relative z-10 px-5 pb-[4.5rem] pt-3">
          <div className="flex items-start gap-3">
            <AlmogAvatarChipWithNameTag size={76} />
            <div className="min-w-0 flex-1 text-right">
              <p
                className="text-[15px] font-black text-white leading-tight"
                style={{ fontFamily: hebrewFont }}
              >
                {progressPageGreeting(firstName)}
              </p>
              {greeting.occasionGreeting ? (
                <p
                  className="mt-1 text-xs font-bold leading-relaxed"
                  style={{
                    color:
                      greeting.tone === 'festive'
                        ? '#FFD97D'
                        : greeting.tone === 'solemn'
                          ? 'rgba(255,255,255,0.78)'
                          : 'rgba(255,255,255,0.92)',
                    fontStyle: greeting.tone === 'solemn' ? 'italic' : 'normal',
                  }}
                >
                  {greeting.occasionGreeting}
                </p>
              ) : (
                <p className="mt-1 text-xs font-semibold text-white/80">
                  {greeting.timeGreeting.replace(/,$/, '')}
                </p>
              )}
              <h1
                className="mt-2 text-2xl font-black text-white tracking-tight"
                style={{ fontFamily: hebrewFont }}
              >
                ההתקדמות שלי
              </h1>
              <p className="mt-2 text-sm text-white/88 leading-relaxed">{almogHeroBody}</p>
            </div>
          </div>
        </div>
      </motion.header>

      <div className="container-mobile relative z-[3] -mt-14 pb-10 space-y-7">
        <section>
          <ProgressSectionHeader
            title="במספרים"
            subtitle={progressStatsSectionSubtitle(gender)}
            tone="teal"
            icon={Sparkles}
          />
          <motion.div
            variants={container}
            initial="hidden"
            animate="show"
            className="mt-3 grid grid-cols-2 gap-3"
          >
            {stats.map((s) => (
              <motion.div
                key={s.label}
                variants={item}
                className="progress-glass-stat rounded-2xl p-4 flex flex-col items-center justify-center gap-2.5 text-center"
              >
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-xl"
                  style={{ background: s.iconBg }}
                >
                  <s.icon className="h-[18px] w-[18px]" strokeWidth={2.2} style={{ color: s.iconColor }} />
                </div>
                <div>
                  <p className="text-xl font-black text-[#1A1730] leading-none tabular-nums">
                    {s.value}
                    {'suffix' in s && s.suffix ? (
                      <span className="mr-1 text-sm font-bold text-[#9896B8]">{s.suffix}</span>
                    ) : null}
                  </p>
                  <p className="mt-1 text-[11px] font-semibold text-[#9896B8]">{s.label}</p>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </section>

        <ProgressSectionDivider tone="indigo" />

        <section>
          <ProgressSectionHeader
            title="מעקב משקל"
            subtitle="אלמוג קורא את המגמה — בלי טפסים מיותרים"
            tone="indigo"
            icon={LineChart}
          />
          <div className="mt-3">
            <WeightTrendInsightCard />
          </div>
        </section>

        <ProgressSectionDivider tone="emerald" />

        <section>
          <div className="mb-3 flex items-start justify-between gap-3">
            <ProgressSectionHeader
              title="המסע שלי"
              subtitle={`${journeyStepsCompleted}/${journeyStepsTotal || '—'} צעדים · ${journeyTasksReportedDone}/${journeyTasksAccepted || '0'} משימות שדווחו`}
              tone="emerald"
              icon={Route}
            />
            <Link
              href="/journey"
              className="inline-flex shrink-0 items-center gap-0.5 rounded-full px-3 py-1.5 text-xs font-bold text-teal-800 crystal-pill"
            >
              למסע
              <ChevronLeft className="h-3.5 w-3.5" />
            </Link>
          </div>

          <motion.section
            variants={item}
            initial="hidden"
            animate="show"
            className="crystal-surface rounded-2xl p-5"
          >
            <div className="space-y-4">
              <div className="space-y-1.5">
                <div className="flex justify-between text-[11px] font-semibold text-[#9896B8]">
                  <span className="tabular-nums text-[#1A1730]">{journeyPct}%</span>
                  <span>התקדמות במסע</span>
                </div>
                <ProgressTrack value={journeyPct} />
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between text-[11px] font-semibold text-[#9896B8]">
                  <span className="tabular-nums text-[#1A1730]">{taskFollowPct}%</span>
                  <span className="inline-flex items-center gap-1">
                    <ListChecks className="h-3.5 w-3.5 text-amber-600" />
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
        </section>

        <ProgressSectionDivider tone="amber" />

        {showDailySection ? (
          <section>
            <div className="mb-3 flex items-start justify-between gap-3">
              <ProgressSectionHeader
                title="מעקב יומי"
                subtitle={`${activeDaysCount} ימים מלאים · 30 הימים האחרונים`}
                tone="amber"
                icon={CalendarDays}
              />
              <Link
                href="/progress/history"
                className="inline-flex shrink-0 items-center gap-0.5 rounded-full px-3 py-1.5 text-xs font-bold text-[#6366f1]"
                style={{
                  background: 'rgba(99,102,241,0.08)',
                  border: '1px solid rgba(99,102,241,0.18)',
                }}
              >
                היסטוריה מפורטת
                <ChevronLeft className="h-3.5 w-3.5" />
              </Link>
            </div>

            <motion.section
              variants={item}
              initial="hidden"
              animate="show"
              className="crystal-surface rounded-2xl p-5"
            >
              <div className="space-y-4">
                <div>
                  <p className="mb-2 text-right text-[10px] font-bold uppercase tracking-wide text-[#9896B8]">
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
                  <p className="mb-2 text-right text-[10px] font-bold uppercase tracking-wide text-[#9896B8]">
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
                  <div
                    className="progress-partial-info-box rounded-2xl px-4 py-3 text-right"
                    role="note"
                  >
                    <p className="text-[12px] font-bold leading-relaxed text-amber-900/90">
                      {partialDaysMessage}
                    </p>
                  </div>
                ) : null}
              </div>
            </motion.section>
          </section>
        ) : (
          <section>
            <ProgressSectionHeader
              title="מעקב יומי"
              subtitle="ציר זמן מפורט לפי תאריך ושעה"
              tone="amber"
              icon={CalendarDays}
            />
            <motion.section
              variants={item}
              initial="hidden"
              animate="show"
              className="crystal-surface mt-3 flex items-center justify-between gap-3 rounded-2xl p-5"
            >
              <Link
                href="/progress/history"
                className="inline-flex shrink-0 items-center gap-0.5 rounded-full px-3 py-1.5 text-xs font-bold text-[#6366f1]"
                style={{
                  background: 'rgba(99,102,241,0.08)',
                  border: '1px solid rgba(99,102,241,0.18)',
                }}
              >
                פתח
                <ChevronLeft className="h-3.5 w-3.5" />
              </Link>
              <div className="min-w-0 text-right">
                <p className="text-sm font-black text-[#1A1730]">היסטוריית משימות</p>
                <p className="mt-0.5 text-xs text-[#9896B8]">כשתתחיל לבצע — זה יופיע כאן</p>
              </div>
            </motion.section>
          </section>
        )}

        {courseStats.length > 0 && (
          <section>
            <ProgressSectionDivider tone="teal" />
            <ProgressSectionHeader title="מדריכים" subtitle="ההתקדמות בכל מדריך" tone="teal" icon={BookOpen} />
            <motion.div
              variants={container}
              initial="hidden"
              animate="show"
              className="mt-3 space-y-2.5"
            >
              {courseStats.map((course) => (
                <motion.div key={course.id} variants={item}>
                  <Link
                    href={`/guides/${course.id}`}
                    className="crystal-surface block flex items-center gap-3 rounded-2xl p-3.5 transition hover:opacity-95"
                  >
                    <div className="h-11 w-11 flex-shrink-0 overflow-hidden rounded-xl border border-black/[0.04] bg-black/[0.04]">
                      {course.thumbnail ? (
                        <Image
                          src={course.thumbnail}
                          alt={course.title}
                          width={44}
                          height={44}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <BookOpen className="h-5 w-5 text-[#9896B8]" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1 text-right">
                      <p className="mb-2 line-clamp-1 text-sm font-bold text-[#1A1730]">{course.title}</p>
                      <ProgressTrack value={course.progress} />
                      <div className="mt-1.5 flex items-center justify-between text-[11px] font-medium text-[#9896B8]">
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
            <ProgressSectionDivider tone="indigo" />
            <ProgressSectionHeader title="פעילות אחרונה" tone="indigo" icon={CheckCircle2} />
            <motion.div variants={container} initial="hidden" animate="show" className="mt-3 space-y-2">
              {recentActivity.map((a, idx) => {
                const IconComp = lessonTypeIcon[a.lesson_type] ?? AlignLeft;
                return (
                  <motion.div key={`${a.lesson_id}-${idx}`} variants={item}>
                    <Link
                      href={`/lessons/${a.lesson_id}`}
                      className="crystal-surface flex items-center gap-3 rounded-2xl p-3 transition hover:opacity-95"
                    >
                      <IconComp className="h-4 w-4 flex-shrink-0 text-[#9896B8]" />
                      <div className="min-w-0 flex-1 text-right">
                        <p className="line-clamp-1 text-sm font-semibold text-[#1A1730]">{a.lesson_title}</p>
                        <p className="mt-0.5 text-[11px] text-[#9896B8]">
                          הושלם · {formatHebrewRelative(a.completed_at)}
                        </p>
                      </div>
                      <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-teal-600" />
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
            className="crystal-surface rounded-2xl px-5 py-12 text-center"
          >
            <div className="mb-3 flex justify-center">
              <AlmogAvatarChipWithNameTag size={64} />
            </div>
            <h3 className="mb-2 text-lg font-black text-[#1A1730]" style={{ fontFamily: hebrewFont }}>
              כאן יופיע הסיכום שלך
            </h3>
            <p className="mx-auto mb-6 max-w-xs text-sm leading-relaxed text-[#9896B8]">
              התחל מפרק או מהמסע — והנתונים יתעדכנו כאן אוטומטית. אני איתך.
            </p>
            <Link
              href="/home"
              className="inline-flex items-center justify-center rounded-2xl px-6 py-3 font-bold text-white crystal-header"
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
