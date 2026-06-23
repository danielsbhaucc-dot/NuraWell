'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  ChevronLeft,
  GraduationCap,
  Sparkles,
} from 'lucide-react';
import { AlmogHeroHeader } from './DolevHeroHeader';
import { DashboardBriefCard } from './DashboardBriefCard';
import { ProgramOrchestratorGate } from './ProgramOrchestratorGate';
import { QuickAccessGrid } from './QuickAccessGrid';
import { HomeSectionDivider } from './HomeSectionDivider';
import { TodayTasksPopup } from './TodayTasksPopup';
import { SosButton } from '../ai/SosButton';
import { SosMemoryCard } from '../ai/SosMemoryCard';
import { buildAlmogGreeting, type GreetingTaskState } from '../../lib/ai/almog-greeting';
import {
  countAcceptedTaskExecutionToday,
  listPendingTasksToday,
  type JourneyReportStepShape,
  type PendingTaskTodayRow,
  type TodayExecutionRow,
} from '../../lib/journey/journey-report-parse';
import { dispatchOpenAlmogChatWithPrefill, dispatchOpenAlmogChatWithTaskReport } from '../../lib/notifications/open-almog-chat';
import { buildTaskReportHintFromPendingRow } from '../../lib/ai/task-report-hint';
import { useProgressReport } from '../progress-report/ProgressReportProvider';
import { useActionHub } from '../action-hub/ActionHubProvider';
import {
  pickNextTaskForNow,
  type UserScheduleProfile,
} from '../../lib/journey/pick-next-task-for-now';

type JourneyReportResponse = {
  steps: JourneyReportStepShape[];
  today_executions?: TodayExecutionRow[];
  today_date_key?: string;
  user_schedule?: UserScheduleProfile;
};

export type HomeStats = {
  activeCoursesCount: number;
  avgProgress: number;
  totalLessonsCompleted: number;
};

interface HomeClientProps {
  firstName: string;
  stats: HomeStats;
  simplifiedDashboard?: boolean;
  /** RSC — DynamicMentorWidget מוזרק מ-home/page (שליפה יחידה). */
  mentorWidget?: React.ReactNode;
}

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
};
const item = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' } },
};

export function HomeClient({
  firstName,
  stats,
  simplifiedDashboard = false,
  mentorWidget,
}: HomeClientProps) {
  const progressReport = useProgressReport();
  const actionHub = useActionHub();
  const [taskLoading, setTaskLoading] = useState(true);
  const [tasksPopupOpen, setTasksPopupOpen] = useState(false);
  const [todayTasks, setTodayTasks] = useState<PendingTaskTodayRow[]>([]);
  const [userSchedule, setUserSchedule] = useState<UserScheduleProfile | undefined>(undefined);
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
      const steps = json.steps ?? [];
      const todayExecutions = json.today_executions ?? [];
      const todayDateKey = json.today_date_key;
      setTaskCounts(
        countAcceptedTaskExecutionToday(steps, todayExecutions, todayDateKey)
      );
      setTodayTasks(listPendingTasksToday(steps, todayExecutions, todayDateKey));
      setUserSchedule(json.user_schedule ?? {});
    } finally {
      setTaskLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshTasks();
  }, [refreshTasks]);

  const nextTask = useMemo(
    () => pickNextTaskForNow(todayTasks, userSchedule ?? {}),
    [todayTasks, userSchedule]
  );

  const greeting = useMemo(() => {
    const taskState: GreetingTaskState = taskLoading
      ? 'loading'
      : taskCounts.dueToday === 0 && taskCounts.accepted === 0
        ? 'fresh'
        : taskCounts.pending > 0
          ? 'pending'
          : 'done';

    const pendingTasks = nextTask
      ? [
          {
            title: nextTask.title,
            emoji: nextTask.emoji,
            slotLabel: nextTask.timeHint,
          },
        ]
      : todayTasks
          .filter((t) => !t.done)
          .map((t) => ({ title: t.title, emoji: t.emoji }));

    return buildAlmogGreeting({
      firstName,
      taskState,
      pendingCount: taskCounts.pending,
      doneCount: taskCounts.done,
      dueToday: taskCounts.dueToday,
      pendingTasks,
    });
  }, [taskCounts, taskLoading, firstName, todayTasks, nextTask]);

  const bubbleContent = useMemo(() => {
    return (
      <>
        {greeting.lead}
        {greeting.featuredTask ? (
          <FeaturedTaskChip
            title={greeting.featuredTask.title}
            emoji={greeting.featuredTask.emoji}
            slotLabel={greeting.featuredTask.slotLabel}
          />
        ) : null}
        {greeting.highlight ? (
          <>
            <br />
            <span
              style={{
                display: 'inline-block',
                marginTop: greeting.featuredTask ? '6px' : '0',
                marginBottom: '4px',
                fontSize: '13px',
                fontWeight: 600,
                color: 'rgba(255,255,255,0.88)',
                lineHeight: 1.5,
              }}
            >
              {greeting.highlight}
            </span>
          </>
        ) : null}
      </>
    );
  }, [greeting]);

  const chatCta = useMemo(() => {
    if (!greeting.chatPrefill || !greeting.chatCtaLabel) return undefined;
    const firstPending = nextTask
      ? todayTasks.find((t) => t.id === nextTask.taskId && !t.done)
      : todayTasks.find((t) => !t.done);
    return {
      label: greeting.chatCtaLabel,
      prefill: greeting.chatPrefill,
      hint: firstPending
        ? buildTaskReportHintFromPendingRow(firstPending, 'home_hero')
        : undefined,
    };
  }, [greeting, todayTasks, nextTask]);

  const taskProgress = useMemo(() => {
    if (!greeting.showProgress || !greeting.progressTotal) return undefined;
    return {
      done: greeting.progressDone ?? 0,
      total: greeting.progressTotal,
    };
  }, [greeting]);

  const taskPreview = useMemo(
    () =>
      nextTask
        ? { title: nextTask.title, hint: nextTask.timeHint, emoji: nextTask.emoji }
        : null,
    [nextTask]
  );

  return (
    <div>
      <div
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
        <div className="relative z-10 px-5 pb-8 pt-3">
          <AlmogHeroHeader
            firstName={firstName}
            bubbleContent={bubbleContent}
            mentorTag={greeting.mentorTag}
            contentLoading={taskLoading}
            chatCta={chatCta}
            taskProgress={taskProgress}
            taskBadge={{
              pending: taskCounts.pending,
              done: taskCounts.done,
              accepted: taskCounts.accepted,
              dueToday: taskCounts.dueToday,
              previewTitle: taskPreview?.title ?? null,
              previewHint: taskPreview?.hint ?? null,
              previewEmoji: taskPreview?.emoji ?? null,
              loading: taskLoading,
            }}
            onTaskBadgeClick={() => setTasksPopupOpen(true)}
          />
        </div>
      </div>

      <div
        className="relative z-[3] -mt-7 min-h-[55vh] rounded-t-[28px] border-t border-white/50 px-4 pb-6 pt-6"
        style={{
          background: 'linear-gradient(180deg, #f8fdfb 0%, #edf5f0 45%, #e8f2ec 100%)',
          boxShadow: '0 -16px 48px rgba(6,78,59,0.12)',
        }}
      >
        <motion.div variants={container} initial="hidden" animate="show" className="mx-auto max-w-lg space-y-3">
          <ProgramOrchestratorGate />

          {mentorWidget ? (
            <motion.div variants={item}>
              <HomeSectionDivider
                title="צעד קטן להיום"
                subtitle="מה הכי נכון לך עכשיו — בלי לחץ"
              />
              {mentorWidget}
            </motion.div>
          ) : null}

          {!simplifiedDashboard && (
            <motion.div variants={item}>
              <DashboardBriefCard onOpenTasks={() => actionHub.open()} firstName={firstName} />
            </motion.div>
          )}

          <motion.div variants={item}>
            <HomeSectionDivider
              title="רגע, קשה לי עכשיו"
              subtitle="סיוע קצר של אלמוג — בלי שיפוט"
            />
            <SosButton
              focusTasks={todayTasks
                .filter((t) => !t.done)
                .map((t) => ({
                  id: t.id,
                  title: t.title,
                  emoji: t.emoji,
                  stepTitle: t.stepTitle,
                  stepId: t.stepId,
                  pendingSlots: t.pendingSlots,
                }))}
            />
          </motion.div>

          <motion.div variants={item}>
            <HomeSectionDivider
              title="מה עזר לך לאחרונה"
              subtitle="מסלול קצר ממה שעבד — לא רשימה עמוסה"
            />
            <SosMemoryCard />
          </motion.div>

          <HomeSectionDivider title="היום שלך" subtitle="משימות ומה שמחכה לך היום" />

          {/* משימות */}
          <motion.div variants={item}>
            <button
              type="button"
              onClick={() => setTasksPopupOpen(true)}
              className="w-full text-right"
            >
              <motion.div
                dir="rtl"
                className="glass-surface-home relative flex flex-row-reverse gap-3.5 items-center p-4"
                style={{ borderRadius: '22px' }}
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
                      ? 'רגע, טוען…'
                      : taskCounts.accepted === 0
                        ? 'עוד לא לקחנו משימות במסע — בוא נתחיל ביחד'
                        : taskCounts.dueToday === 0
                          ? 'אין משימה פתוחה להיום — מחר נמשיך 🌱'
                          : taskCounts.pending > 0
                            ? `${taskCounts.pending} משימות מחכות לך היום`
                            : 'סיימת את כל מה שלהיום! גאה בך ✦'}
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

          {/* מדריכים — מוסתר במצב רגשי רגיש (מטריקות מורכבות) */}
          {!simplifiedDashboard && stats.activeCoursesCount > 0 && (
            <motion.div variants={item}>
              <Link href="/guides" prefetch className="block">
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
                      כבר סיימת {stats.totalLessonsCompleted} פרקים — בוא נמשיך
                    </p>
                  </div>
                  <ChevronLeft className="w-5 h-5 text-amber-800/35 shrink-0 mr-auto" aria-hidden />
                </div>
              </Link>
            </motion.div>
          )}

          <HomeSectionDivider title="ניווט מהיר" subtitle="קיצורי דרך לעמודים חשובים" />

          <motion.div variants={item}>
            <QuickAccessGrid
              simplifiedDashboard={simplifiedDashboard}
              onOpenTasks={() => actionHub.open()}
            />
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
                בוא נתחיל את המסע
              </h3>
              <p className="text-sm max-w-[240px] mx-auto leading-relaxed mb-4" style={{ color: '#9896B8' }}>
                תקפוץ למסע שלך, ואני אפתח לך את המדריכים ברגע שהם מוכנים בשבילך
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

      <TodayTasksPopup
        open={tasksPopupOpen}
        firstName={firstName}
        tasks={todayTasks}
        doneCount={taskCounts.done}
        pendingCount={taskCounts.pending}
        userSchedule={userSchedule}
        onClose={() => setTasksPopupOpen(false)}
        onMarkDone={() => {
          setTasksPopupOpen(false);
          progressReport.open('task_execution');
        }}
        onOpenChat={(prefill, hint) => {
          if (hint) dispatchOpenAlmogChatWithTaskReport(prefill, hint);
          else dispatchOpenAlmogChatWithPrefill(prefill);
        }}
      />
    </div>
  );
}

/** תגית משימה מודרנית בתוך בועת אלמוג */
export function FeaturedTaskChip({
  title,
  emoji,
  slotLabel,
}: {
  title: string;
  emoji?: string;
  slotLabel?: string;
}) {
  return (
    <span
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '8px',
        marginTop: '8px',
        padding: '8px 10px',
        borderRadius: '12px',
        background: 'linear-gradient(135deg, rgba(255,217,125,0.22), rgba(255,255,255,0.1))',
        border: '1px solid rgba(255,217,125,0.35)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2)',
      }}
    >
      {emoji ? (
        <span style={{ fontSize: '16px', lineHeight: 1.2, flexShrink: 0 }} aria-hidden>
          {emoji}
        </span>
      ) : null}
      <span style={{ minWidth: 0, flex: 1 }}>
        <span
          style={{
            display: 'block',
            fontSize: '13px',
            fontWeight: 800,
            color: '#FFF7ED',
            lineHeight: 1.4,
            wordBreak: 'break-word',
          }}
        >
          {title}
        </span>
        {slotLabel ? (
          <span
            style={{
              display: 'inline-block',
              marginTop: '3px',
              fontSize: '10px',
              fontWeight: 700,
              color: 'rgba(255,255,255,0.78)',
              background: 'rgba(255,255,255,0.12)',
              borderRadius: '999px',
              padding: '2px 8px',
            }}
          >
            {slotLabel}
          </span>
        ) : null}
      </span>
    </span>
  );
}
