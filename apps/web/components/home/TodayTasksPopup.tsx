'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  CheckCircle2,
  ClipboardCheck,
  MessageCircle,
  Sparkles,
  X,
} from 'lucide-react';
import { useDialogA11y } from '@/lib/a11y/use-dialog-a11y';
import { ALMOG_AVATAR_FALLBACK } from '../../lib/ai/almog-avatar';
import { buildTaskDoneChatPrefill } from '../../lib/ai/almog-greeting';
import {
  buildTaskReportHintFromPendingRow,
  type TaskReportHint,
} from '../../lib/ai/task-report-hint';
import { useAlmogAvatarUrl } from '../../lib/client/useAlmogAvatarUrl';
import { slotLabel } from '../../lib/journey/task-schedule';
import {
  buildTaskTimeHint,
  pickNextTaskForNow,
} from '../../lib/journey/pick-next-task-for-now';
import type { JourneyTaskSlot } from '../../lib/types/journey';
import type { PendingTaskTodayRow } from '../../lib/journey/journey-report-parse';
import type { UserScheduleProfile } from '../../lib/journey/pick-next-task-for-now';

interface TodayTasksPopupProps {
  open: boolean;
  firstName?: string;
  tasks: PendingTaskTodayRow[];
  doneCount: number;
  pendingCount: number;
  userSchedule?: UserScheduleProfile;
  onClose: () => void;
  onMarkDone: () => void;
  onOpenChat: (prefill: string, hint?: TaskReportHint) => void;
}

function taskTimeHintForRow(
  task: PendingTaskTodayRow,
  profile: UserScheduleProfile,
  now: Date = new Date()
): string | null {
  const slotKey = task.pendingSlots.find((s) => s !== 'once') ?? task.pendingSlots[0];
  if (!slotKey) return null;
  const slotLabelHe =
    slotKey === 'once' ? 'היום' : slotLabel(slotKey as JourneyTaskSlot, task.meal_timing);
  return buildTaskTimeHint(slotKey, slotLabelHe, task, profile, now);
}

export function TodayTasksPopup({
  open,
  firstName = '',
  tasks,
  doneCount,
  pendingCount,
  userSchedule,
  onClose,
  onMarkDone,
  onOpenChat,
}: TodayTasksPopupProps) {
  const [mounted, setMounted] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const { avatarUrl } = useAlmogAvatarUrl();
  const schedule = userSchedule ?? {};
  useEffect(() => setMounted(true), []);

  useDialogA11y({
    open,
    onClose,
    containerRef: dialogRef,
  });

  const nextTask = useMemo(
    () => pickNextTaskForNow(tasks, schedule),
    [tasks, schedule]
  );

  const pendingTasks = useMemo(() => {
    const openTasks = tasks.filter((t) => !t.done);
    if (!nextTask) return openTasks;
    return [...openTasks].sort((a, b) => {
      if (a.id === nextTask.taskId) return -1;
      if (b.id === nextTask.taskId) return 1;
      return a.stepNumber - b.stepNumber;
    });
  }, [tasks, nextTask]);

  const doneTasks = tasks.filter((t) => t.done);
  const firstPending = pendingTasks[0];
  const name = firstName.trim();
  const progressPct =
    pendingCount + doneCount > 0
      ? Math.round((doneCount / (pendingCount + doneCount)) * 100)
      : 0;

  const openChatForTask = (task: PendingTaskTodayRow) => {
    const slotKey = task.pendingSlots.find((s) => s !== 'once');
    const slotLabelHe =
      slotKey && slotKey !== 'once' ? slotLabel(slotKey as JourneyTaskSlot) : null;
    onClose();
    onOpenChat(
      buildTaskDoneChatPrefill(task.title, slotLabelHe),
      buildTaskReportHintFromPendingRow(task, 'home_tasks_popup')
    );
  };

  const openChatGeneral = () => {
    onClose();
    if (firstPending) {
      const slotKey = firstPending.pendingSlots.find((s) => s !== 'once');
      const slotLabelHe =
        slotKey && slotKey !== 'once' ? slotLabel(slotKey as JourneyTaskSlot) : null;
      onOpenChat(
        buildTaskDoneChatPrefill(firstPending.title, slotLabelHe),
        buildTaskReportHintFromPendingRow(firstPending, 'home_tasks_popup')
      );
      return;
    }
    onOpenChat(name ? `היי אלמוג, מה כדאי לי להתמקד בו היום?` : 'בוא נדבר על המשימות שלי להיום');
  };

  if (!mounted) return null;

  const headerTitle =
    pendingCount > 0
      ? name
        ? `${name}, בוא נסגור את מה שפתוח`
        : 'בוא נסגור את מה שפתוח'
      : name
        ? `${name}, יפה מאוד היום`
        : 'יפה מאוד היום';

  const headerMeta =
    pendingCount > 0
      ? pendingCount === 1
        ? 'משימה אחת פתוחה'
        : `${pendingCount} משימות פתוחות`
      : doneCount > 0
        ? `${doneCount} ${doneCount === 1 ? 'משימה בוצעה' : 'משימות בוצעו'} היום`
        : 'אין משימות פעילות להיום';

  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          key="today-tasks-popup"
          dir="rtl"
          className="fixed inset-0 z-[280] flex items-center justify-center px-4"
          style={{
            paddingTop: 'calc(64px + env(safe-area-inset-top, 0px) + 8px)',
            paddingBottom: 'calc(80px + env(safe-area-inset-bottom, 0px) + 12px)',
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <button
            type="button"
            aria-label="סגירה"
            onClick={onClose}
            className="absolute inset-0"
            style={{ background: 'rgba(4,47,36,0.62)' }}
          />
          <motion.div
            ref={dialogRef}
            dir="rtl"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="relative w-full max-w-sm rounded-[28px] overflow-hidden flex flex-col"
            initial={{ y: 20, opacity: 0, scale: 0.96 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 20, opacity: 0, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 340, damping: 30 }}
            style={{
              maxHeight: '100%',
              background: '#f0fdf8',
              border: '1px solid rgba(255,255,255,0.9)',
              boxShadow: '0 32px 80px rgba(4,47,36,0.35), 0 0 0 1px rgba(16,185,129,0.08)',
            }}
          >
            <button
              type="button"
              onClick={onClose}
              className="absolute top-3.5 left-3.5 z-20 flex h-8 w-8 items-center justify-center rounded-full text-white/90 hover:text-white transition-colors"
              style={{
                background: 'rgba(255,255,255,0.18)',
                border: '1px solid rgba(255,255,255,0.28)',
              }}
              aria-label="סגירה"
            >
              <X className="w-4 h-4" />
            </button>

            <div
              className="relative shrink-0 px-5 pt-5 pb-4 text-right overflow-hidden"
              style={{
                background:
                  'linear-gradient(145deg, #034d3a 0%, #047857 42%, #0d9488 100%)',
              }}
            >
              <span
                aria-hidden
                className="pointer-events-none absolute -left-10 -top-8 h-32 w-32 rounded-full"
                style={{
                  background: 'radial-gradient(circle, rgba(255,255,255,0.22), transparent 68%)',
                }}
              />
              <div className="relative flex items-center gap-3">
                <div
                  className="shrink-0 rounded-full p-[2px]"
                  style={{
                    background: 'linear-gradient(145deg, #FFD97D, #10b981)',
                    boxShadow: '0 4px 14px rgba(0,0,0,0.2)',
                  }}
                >
                  <img
                    src={avatarUrl}
                    alt=""
                    className="h-12 w-12 rounded-full object-cover bg-white"
                    onError={(e) => {
                      e.currentTarget.onerror = null;
                      e.currentTarget.src = ALMOG_AVATAR_FALLBACK;
                    }}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-bold tracking-wide text-emerald-100/85">
                    אלמוג · המנטור שלך
                  </p>
                  <h2
                    id={titleId}
                    className="text-lg font-black text-white leading-tight mt-0.5"
                    style={{ fontFamily: "'Rubik','Heebo',sans-serif" }}
                  >
                    {headerTitle}
                  </h2>
                  <p className="text-xs font-semibold text-emerald-50/90 mt-1">{headerMeta}</p>
                </div>
              </div>

              {pendingCount + doneCount > 0 ? (
                <div className="relative mt-3.5">
                  <div className="flex justify-between text-[10px] font-bold text-emerald-50/85 mb-1.5">
                    <span>התקדמות היום</span>
                    <span>
                      {doneCount}/{pendingCount + doneCount}
                    </span>
                  </div>
                  <div
                    className="h-2 rounded-full overflow-hidden"
                    style={{ background: 'rgba(255,255,255,0.2)' }}
                  >
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${progressPct}%`,
                        background: 'linear-gradient(90deg, #FFD97D, #FBBF24)',
                        boxShadow: '0 0 10px rgba(251,191,36,0.5)',
                      }}
                    />
                  </div>
                </div>
              ) : null}
            </div>

            <div className="p-4 space-y-2.5 overflow-y-auto flex-1 min-h-0 bg-gradient-to-b from-white to-emerald-50/40">
              {pendingTasks.length === 0 && doneTasks.length === 0 ? (
                <div
                  className="rounded-2xl p-4 text-right"
                  style={{
                    background: '#ffffff',
                    border: '1px solid rgba(167,243,208,0.55)',
                    boxShadow: '0 6px 20px rgba(6,78,59,0.06)',
                  }}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
                    <p className="text-sm font-black text-emerald-900">המסע מחכה לך</p>
                  </div>
                  <p className="text-xs text-emerald-800/85 leading-relaxed mb-3">
                    {name
                      ? `${name}, עוד לא לקחנו משימות במסע. בוא נתחיל ביחד כשמתאים לך.`
                      : 'עוד לא לקחנו משימות במסע. בוא נתחיל ביחד כשמתאים לך.'}
                  </p>
                  <button
                    type="button"
                    onClick={openChatGeneral}
                    className="w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-black text-white"
                    style={{
                      background: 'linear-gradient(145deg, #047857, #10b981)',
                      boxShadow: '0 6px 18px rgba(4,120,87,0.22)',
                    }}
                  >
                    <MessageCircle className="w-4 h-4" />
                    נדבר עם אלמוג
                  </button>
                </div>
              ) : null}

              {pendingTasks.map((task, index) => {
                const timeHint =
                  index === 0 && nextTask?.taskId === task.id
                    ? nextTask.timeHint
                    : taskTimeHintForRow(task, schedule);
                const isFeatured = index === 0 && pendingCount > 0;

                return (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => openChatForTask(task)}
                    className="w-full text-right rounded-2xl p-3.5 transition active:scale-[0.98]"
                    style={{
                      background: isFeatured
                        ? 'linear-gradient(170deg, #ffffff 0%, #fffbeb 100%)'
                        : '#ffffff',
                      border: isFeatured
                        ? '1.5px solid rgba(245,158,11,0.45)'
                        : '1px solid rgba(167,243,208,0.45)',
                      boxShadow: isFeatured
                        ? '0 10px 24px rgba(245,158,11,0.12)'
                        : '0 4px 14px rgba(6,78,59,0.05)',
                    }}
                    aria-label={`ספר לאלמוג שסיימת את ${task.title}`}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xl"
                        style={{
                          background: isFeatured
                            ? 'linear-gradient(145deg, #fef3c7, #fde68a)'
                            : 'rgba(236,253,245,0.95)',
                          border: isFeatured
                            ? '1px solid rgba(245,158,11,0.35)'
                            : '1px solid rgba(110,231,183,0.4)',
                        }}
                      >
                        {task.emoji}
                      </div>
                      <div className="min-w-0 flex-1">
                        {isFeatured ? (
                          <span
                            className="inline-block text-[9px] font-bold text-amber-900 mb-1 px-2 py-0.5 rounded-full"
                            style={{
                              background: 'rgba(254,240,138,0.85)',
                              border: '1px solid rgba(245,158,11,0.3)',
                            }}
                          >
                            מומלץ עכשיו
                          </span>
                        ) : null}
                        <p className="text-sm font-black text-emerald-950 leading-snug">
                          {task.title}
                        </p>
                        <p className="text-[10px] font-medium text-emerald-800/70 mt-0.5">
                          {task.stepTitle} · צעד {task.stepNumber}
                        </p>
                        {timeHint ? (
                          <span
                            className="inline-block text-[10px] font-bold mt-2 px-2.5 py-0.5 rounded-full text-emerald-900"
                            style={{
                              background: isFeatured
                                ? 'rgba(254,240,138,0.55)'
                                : 'rgba(167,243,208,0.45)',
                              border: '1px solid rgba(110,231,183,0.35)',
                            }}
                          >
                            {timeHint}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </button>
                );
              })}

              {doneTasks.length > 0 ? (
                <>
                  <p className="text-[10px] font-bold text-emerald-800/50 px-1 pt-1">
                    כבר סגרת היום
                  </p>
                  {doneTasks.map((task) => (
                    <article
                      key={`done-${task.id}`}
                      className="rounded-2xl p-3.5"
                      style={{
                        background: 'rgba(255,255,255,0.85)',
                        border: '1px solid rgba(167,243,208,0.4)',
                      }}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xl opacity-80"
                          style={{
                            background: 'rgba(236,253,245,0.9)',
                            border: '1px solid rgba(167,243,208,0.5)',
                          }}
                        >
                          {task.emoji}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-black text-emerald-900/75 leading-snug line-through decoration-emerald-600/30">
                            {task.title}
                          </p>
                          <span
                            className="text-[10px] font-bold px-2 py-0.5 rounded-full text-emerald-800 inline-flex items-center gap-1 mt-1"
                            style={{
                              background: 'rgba(167,243,208,0.5)',
                              border: '1px solid rgba(110,231,183,0.4)',
                            }}
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            בוצע
                          </span>
                        </div>
                      </div>
                    </article>
                  ))}
                </>
              ) : null}
            </div>

            <div
              className="px-4 py-3.5 shrink-0 space-y-2.5"
              style={{
                background: '#ffffff',
                borderTop: '1px solid rgba(167,243,208,0.45)',
              }}
            >
              {pendingCount > 0 ? (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={onMarkDone}
                    className="flex flex-col items-center justify-center gap-1 rounded-2xl py-3.5 text-[11px] font-black text-white"
                    style={{
                      background: 'linear-gradient(145deg, #047857, #10b981)',
                      boxShadow: '0 8px 22px rgba(4,120,87,0.28)',
                    }}
                  >
                    <ClipboardCheck className="w-5 h-5" />
                    סמן בעצמי
                  </button>
                  <button
                    type="button"
                    onClick={openChatGeneral}
                    className="flex flex-col items-center justify-center gap-1 rounded-2xl py-3.5 text-[11px] font-black text-white"
                    style={{
                      background: 'linear-gradient(145deg, #0f766e, #14b8a6)',
                      boxShadow: '0 8px 22px rgba(15,118,110,0.25)',
                    }}
                  >
                    <MessageCircle className="w-5 h-5" />
                    לצ׳אט אלמוג
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={openChatGeneral}
                  className="w-full flex items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-black text-white"
                  style={{
                    background: 'linear-gradient(145deg, #047857, #10b981)',
                    boxShadow: '0 8px 22px rgba(4,120,87,0.25)',
                  }}
                >
                  <MessageCircle className="w-4 h-4" />
                  ספר לאלמוג איך מרגיש
                </button>
              )}
              <p className="text-center text-[11px] font-medium text-emerald-800/65 leading-relaxed">
                {pendingCount > 0
                  ? 'לחיצה על משימה פותחת צ׳אט עם טקסט מוכן — אלמוג יסמן בשבילך'
                  : 'יום מצוין. מחר נמשיך 🌱'}
              </p>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}
