'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  BookOpen,
  ChevronLeft,
  ClipboardCheck,
  GraduationCap,
  Route,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { AlmogHeroHeader } from './DolevHeroHeader';
import { DashboardBriefCard } from './DashboardBriefCard';
import { buildAlmogGreeting, type GreetingTaskState } from '../../lib/ai/almog-greeting';
import {
  countAcceptedTaskExecutionToday,
  type JourneyReportStepShape,
  type TodayExecutionRow,
} from '../../lib/journey/journey-report-parse';
import { useProgressReport } from '../progress-report/ProgressReportProvider';
import { useActionHub } from '../action-hub/ActionHubProvider';

type JourneyReportResponse = {
  steps: JourneyReportStepShape[];
  today_executions?: TodayExecutionRow[];
  today_date_key?: string;
};

export type HomeStats = {
  activeCoursesCount: number;
  avgProgress: number;
  totalLessonsCompleted: number;
};

interface HomeClientProps {
  firstName: string;
  stats: HomeStats;
}

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
};
const item = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' } },
};

export function HomeClient({ firstName, stats }: HomeClientProps) {
  const progressReport = useProgressReport();
  const actionHub = useActionHub();
  const [taskLoading, setTaskLoading] = useState(true);
  const [taskCounts, setTaskCounts] = useState({
    accepted: 0,
    done: 0,
    pending: 0,
    dueToday: 0,
  });

  const refreshTasks = useCallback(async () => {
    setTaskLoading(true);
    try {
      const res = await fetch('/api/v1/journey-report', { cache: 'no-store' });
      const json = (await res.json()) as JourneyReportResponse & { error?: string };
      if (!res.ok) return;
      setTaskCounts(
        countAcceptedTaskExecutionToday(
          json.steps ?? [],
          json.today_executions ?? [],
          json.today_date_key
        )
      );
    } finally {
      setTaskLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshTasks();
  }, [refreshTasks]);

  const bubbleContent = useMemo(() => {
    const taskState: GreetingTaskState = taskLoading
      ? 'loading'
      : taskCounts.dueToday === 0 && taskCounts.accepted === 0
        ? 'fresh'
        : taskCounts.pending > 0
          ? 'pending'
          : 'done';

    const greeting = buildAlmogGreeting({
      firstName,
      taskState,
      pendingCount: taskCounts.pending,
    });

    if (!greeting.highlight) {
      return <>{greeting.lead}</>;
    }

    return (
      <>
        {greeting.lead}
        <br />
        <strong style={{ color: '#FFD97D', fontWeight: 700 }}>{greeting.highlight}</strong>
      </>
    );
  }, [taskCounts, taskLoading, firstName]);

  return (
    <div>
      <div
        className="-mt-16 pt-16 relative overflow-hidden"
        style={{
          background: 'linear-gradient(160deg, #047857 0%, #059669 50%, #10b981 80%, #34d399 100%)',
        }}
      >
        <div
          className="absolute pointer-events-none"
          style={{
            width: '80px',
            height: '80px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(245,166,35,0.3) 0%, transparent 70%)',
            bottom: '20px',
            left: '50%',
            filter: 'blur(12px)',
          }}
        />
        <div className="relative z-10" style={{ padding: '12px 20px 40px' }}>
          <AlmogHeroHeader
            firstName={firstName}
            bubbleContent={bubbleContent}
            taskBadge={{
              pending: taskCounts.pending,
              done: taskCounts.done,
              accepted: taskCounts.accepted,
              loading: taskLoading,
            }}
          />
        </div>
      </div>

      <div
        style={{
          background: '#EDF5F0',
          borderRadius: '26px 26px 0 0',
          marginTop: '-18px',
          padding: '22px 16px 20px',
          position: 'relative',
          zIndex: 3,
          minHeight: '55vh',
        }}
      >
        <motion.div variants={container} initial="hidden" animate="show" className="space-y-3.5">
          {/* תקציר חי מאלמוג — שכבת AI בראש הדשבורד */}
          <motion.div variants={item}>
            <DashboardBriefCard onOpenTasks={() => actionHub.open()} />
          </motion.div>

          {/* משימות */}
          <motion.div variants={item}>
            <button
              type="button"
              onClick={() => progressReport.open('task_execution')}
              className="w-full text-right"
            >
              <motion.div
                dir="rtl"
                className="glass-surface relative flex flex-row-reverse gap-3.5 items-center p-4 overflow-hidden"
                style={{ borderRadius: '22px' }}
              >
                {/* ✦ קו אור עליון — specular highlight */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-x-4 top-px h-px"
                  style={{
                    background:
                      'linear-gradient(90deg, transparent, rgba(255,255,255,0.85), transparent)',
                  }}
                />
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
                  <span style={{ fontSize: '22px', fontWeight: 900, color: '#fff', lineHeight: 1 }}>
                    {taskLoading ? '…' : taskCounts.done}
                  </span>
                  <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.75)', fontWeight: 600 }}>
                    מתוך {taskLoading ? '…' : taskCounts.dueToday || taskCounts.accepted || '·'}
                  </span>
                </div>
                <div className="relative text-right" style={{ flex: 1 }}>
                  <p
                    style={{
                      fontSize: '15px',
                      fontWeight: 800,
                      color: '#022c22',
                      fontFamily: "'Rubik','Heebo',sans-serif",
                    }}
                  >
                    המשימות שלי
                  </p>
                  <p style={{ fontSize: '12px', color: '#065f46', margin: '2px 0 8px', opacity: 0.85 }}>
                    {taskLoading
                      ? 'טוען…'
                      : taskCounts.accepted === 0
                        ? 'עדיין לא לקחתם משימות במסע, בואו נתחיל'
                        : taskCounts.dueToday === 0
                          ? 'אין משימות פעילות להיום, מחר נמשיך'
                          : taskCounts.pending > 0
                            ? `${taskCounts.pending} משימות ממתינות לסימון היום`
                            : 'כל משימות היום בוצעו! ✦'}
                  </p>
                  {(taskCounts.dueToday > 0 || taskCounts.accepted > 0) && (
                    <div className="flex gap-1">
                      {Array.from({
                        length: Math.min(taskCounts.dueToday || taskCounts.accepted, 8),
                      }).map((_, i) => (
                        <div
                          key={i}
                          style={{
                            height: '6px',
                            flex: 1,
                            borderRadius: '10px',
                            background:
                              i < taskCounts.done
                                ? 'linear-gradient(90deg, #14b8a6, #5eead4)'
                                : 'rgba(6,78,59,0.12)',
                          }}
                        />
                      ))}
                    </div>
                  )}
                </div>
                <ChevronLeft className="relative w-5 h-5 text-emerald-800/45 shrink-0" aria-hidden />
              </motion.div>
            </button>
          </motion.div>

          {/* מדריכים */}
          {stats.activeCoursesCount > 0 && (
            <motion.div variants={item}>
              <Link href="/courses" prefetch className="block">
                <div
                  className="glass-surface flex gap-3.5 items-center p-4"
                  style={{
                    borderRadius: '20px',
                    border: '1px solid rgba(245,166,35,0.35)',
                    boxShadow:
                      '0 8px 24px rgba(245,166,35,0.14), inset 0 1px 0 rgba(255,255,255,0.55), inset 0 -1px 0 rgba(255,255,255,0.10)',
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
                    <span style={{ fontSize: '18px', fontWeight: 900, color: 'white', lineHeight: 1 }}>
                      {stats.avgProgress}%
                    </span>
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
                      {stats.activeCoursesCount} מדריכים פעילים
                    </p>
                    <p style={{ fontSize: '12px', color: '#B45309', marginTop: '2px' }}>
                      {stats.totalLessonsCompleted} פרקים הושלמו, המשיכו ללמוד
                    </p>
                  </div>
                  <ChevronLeft className="w-5 h-5 text-amber-800/35 shrink-0 mr-auto" aria-hidden />
                </div>
              </Link>
            </motion.div>
          )}

          <motion.div variants={item}>
            <p
              style={{
                fontSize: '10px',
                fontWeight: 700,
                color: '#9896B8',
                letterSpacing: '1.2px',
                textTransform: 'uppercase',
                margin: '8px 0 10px 2px',
              }}
            >
              המשך מהר
            </p>
            <div className="grid grid-cols-2 gap-3">
              <QuickLink href="/journey" icon={Route} label="המסע שלי" accent="#10b981" />
              <QuickLink href="/courses" icon={BookOpen} label="המדריכים" accent="#14b8a6" />
              <QuickLink
                href="#"
                icon={ClipboardCheck}
                label="עדכון משימות"
                accent="#047857"
                onClick={(e) => {
                  e.preventDefault();
                  actionHub.open();
                }}
              />
              <QuickLink href="/progress" icon={TrendingUp} label="התקדמות" accent="#f59e0b" />
            </div>
          </motion.div>

          {stats.activeCoursesCount === 0 && (
            <motion.div variants={item} className="text-center py-10">
              <div className="relative w-20 h-20 mx-auto mb-5">
                <div
                  className="absolute inset-0 rounded-3xl"
                  style={{
                    background: 'linear-gradient(145deg, #047857, #10b981)',
                    boxShadow: '0 8px 32px rgba(4,120,87,0.25)',
                  }}
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <GraduationCap className="w-9 h-9 text-white" />
                </div>
              </div>
              <h3
                className="text-xl font-black mb-2"
                style={{ color: '#1A1730', fontFamily: "'Rubik','Heebo',sans-serif" }}
              >
                מתחילים את המסע
              </h3>
              <p className="text-sm max-w-[240px] mx-auto leading-relaxed mb-4" style={{ color: '#9896B8' }}>
                עברו למסע שלכם או למדריכים כשהם ייפתחו עבורכם
              </p>
              <Link
                href="/journey"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white"
                style={{ background: 'linear-gradient(145deg, #047857, #10b981)' }}
              >
                <Sparkles className="w-4 h-4" />
                למסע שלי
              </Link>
            </motion.div>
          )}
        </motion.div>
      </div>
    </div>
  );
}

function QuickLink({
  href,
  icon: Icon,
  label,
  accent,
  onClick,
}: {
  href: string;
  icon: React.ElementType;
  label: string;
  accent: string;
  onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
}) {
  const inner = (
    <div className="glass-surface relative flex flex-col items-center gap-2 p-4 rounded-[20px] transition overflow-hidden active:scale-[0.98]">
      {/* ✦ קו אור עליון */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-3 top-px h-px"
        style={{
          background:
            'linear-gradient(90deg, transparent, rgba(255,255,255,0.85), transparent)',
        }}
      />
      <div
        className="w-11 h-11 rounded-2xl flex items-center justify-center"
        style={{
          background: `linear-gradient(135deg, ${accent}33, ${accent}14)`,
          border: `1px solid ${accent}55`,
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.55)',
        }}
      >
        <Icon className="w-5 h-5" style={{ color: accent }} strokeWidth={2.4} />
      </div>
      <span className="text-[12px] font-bold text-emerald-950">{label}</span>
    </div>
  );

  if (onClick) {
    return (
      <a href={href} onClick={onClick} className="block no-tap-highlight">
        {inner}
      </a>
    );
  }

  return (
    <Link href={href} prefetch className="block no-tap-highlight">
      {inner}
    </Link>
  );
}
