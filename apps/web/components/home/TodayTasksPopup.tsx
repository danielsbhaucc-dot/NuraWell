'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { getAppOverlayRoot } from '../../lib/dom/app-overlay-root';
import {
  CheckCircle2,
  ClipboardCheck,
  Loader2,
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
import type { AlmogTodayRow } from '../../lib/tasks/user-task-ssot';

interface TodayTasksPopupProps {
  open: boolean;
  firstName?: string;
  tasks: PendingTaskTodayRow[];
  /** משימות אלמוג פתוחות — מאותו SSOT כמו בית/תוכנית/מסע. */
  almogTasks?: AlmogTodayRow[];
  doneCount: number;
  pendingCount: number;
  userSchedule?: UserScheduleProfile;
  onClose: () => void;
  onMarkDone: () => void;
  onOpenChat: (prefill: string, hint?: TaskReportHint) => void;
  /** אחרי סימון משימת אלמוג — לרענון SSOT בבית. */
  onAlmogMarked?: () => void;
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

async function markAlmogDone(task: AlmogTodayRow): Promise<boolean> {
  const ids = task.groupedIds?.length ? task.groupedIds : [task.id];
  const res = await fetch('/api/v1/almog-assignments', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'done',
      assignment_id: task.id,
      assignment_ids: ids,
    }),
  });
  return res.ok;
}

async function markJourneyDone(task: PendingTaskTodayRow): Promise<boolean> {
  const slot = task.pendingSlots[0] ?? 'once';
  const res = await fetch('/api/v1/task-executions', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      step_id: task.stepId,
      task_id: task.id,
      slot: slot === 'once' ? 'full_day' : slot,
      source: 'manual',
      outcome: 'completed',
    }),
  });
  return res.ok;
}

export function TodayTasksPopup({
  open,
  firstName = '',
  tasks,
  almogTasks = [],
  doneCount,
  pendingCount,
  userSchedule,
  onClose,
  onMarkDone,
  onOpenChat,
  onAlmogMarked,
}: TodayTasksPopupProps) {
  const [mounted, setMounted] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
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

  useEffect(() => {
    if (!open) {
      setExpandedId(null);
      setBusyId(null);
    }
  }, [open]);

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

  const openChatForJourney = (task: PendingTaskTodayRow) => {
    const slotKey = task.pendingSlots.find((s) => s !== 'once');
    const slotLabelHe =
      slotKey && slotKey !== 'once' ? slotLabel(slotKey as JourneyTaskSlot) : null;
    onClose();
    onOpenChat(
      buildTaskDoneChatPrefill(task.title, slotLabelHe),
      buildTaskReportHintFromPendingRow(task, 'home_tasks_popup')
    );
  };

  const openChatForAlmog = (task: AlmogTodayRow) => {
    onClose();
    onOpenChat(buildTaskDoneChatPrefill(task.title, null));
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
    if (almogTasks[0]) {
      onOpenChat(buildTaskDoneChatPrefill(almogTasks[0].title, null));
      return;
    }
    onOpenChat(name ? `היי אלמוג, מה כדאי לי להתמקד בו היום?` : 'בוא נדבר על המשימות שלי להיום');
  };

  const handleMarkJourney = async (task: PendingTaskTodayRow) => {
    setBusyId(task.id);
    try {
      const ok = await markJourneyDone(task);
      if (ok) onAlmogMarked?.();
    } finally {
      setBusyId(null);
    }
  };

  const handleMarkAlmog = async (task: AlmogTodayRow) => {
    setBusyId(task.id);
    try {
      const ok = await markAlmogDone(task);
      if (ok) onAlmogMarked?.();
    } finally {
      setBusyId(null);
    }
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
          data-nura-overlay="1"
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
              background:
                'linear-gradient(168deg, rgba(248,251,246,0.78) 0%, rgba(236,253,245,0.62) 52%, rgba(248,251,246,0.72) 100%)',
              border: '1px solid rgba(167,243,208,0.35)',
              boxShadow: '0 32px 80px rgba(4,47,36,0.32), inset 0 1px 0 rgba(248,251,246,0.85)',
              backdropFilter: 'blur(28px) saturate(1.5)',
              WebkitBackdropFilter: 'blur(28px) saturate(1.5)',
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
                  'linear-gradient(145deg, rgba(3,77,58,0.92) 0%, rgba(4,120,87,0.88) 42%, rgba(13,148,136,0.85) 100%)',
                borderBottom: '1px solid rgba(255,255,255,0.12)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18)',
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
                    background: 'linear-gradient(145deg, rgba(255,217,125,0.95), rgba(16,185,129,0.9))',
                    boxShadow: '0 4px 14px rgba(0,0,0,0.2)',
                  }}
                >
                  <img
                    src={avatarUrl}
                    alt=""
                    className="h-12 w-12 rounded-full object-cover"
                    style={{ background: 'rgba(255,255,255,0.15)' }}
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

            <div
              className="p-4 space-y-2.5 overflow-y-auto flex-1 min-h-0"
              style={{
                background:
                  'linear-gradient(180deg, rgba(255,255,255,0.42) 0%, rgba(236,253,245,0.28) 100%)',
              }}
            >
              {pendingTasks.length === 0 && doneTasks.length === 0 && almogTasks.length === 0 ? (
                <div
                  className="rounded-2xl p-4 text-right"
                  style={{
                    background: '#f8fbf6',
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
                      ? `${name}, עוד לא לקחנו משימות. בוא נתחיל ביחד כשמתאים לך.`
                      : 'עוד לא לקחנו משימות. בוא נתחיל ביחד כשמתאים לך.'}
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

              {almogTasks.map((task) => {
                const isExpanded = expandedId === `almog-${task.id}`;
                const busy = busyId === task.id;
                return (
                  <article
                    key={`almog-${task.id}`}
                    className="w-full text-right rounded-2xl p-3.5"
                    style={{
                      background: 'rgba(248,251,246,0.55)',
                      border: '1px solid rgba(167,243,208,0.4)',
                      boxShadow:
                        '0 4px 14px rgba(6,78,59,0.05), inset 0 1px 0 rgba(248,251,246,0.65)',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedId(isExpanded ? null : `almog-${task.id}`)
                      }
                      className="w-full text-right"
                      aria-expanded={isExpanded}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xl"
                          style={{
                            background: 'rgba(236,253,245,0.95)',
                            border: '1px solid rgba(110,231,183,0.4)',
                          }}
                        >
                          ✨
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-black text-emerald-950 leading-snug">
                            {task.title}
                          </p>
                          <p className="text-[10px] font-medium text-emerald-800/70 mt-0.5">
                            מאלמוג · פתוח
                            {(task.similarCount ?? 1) > 1
                              ? ` · ${task.similarCount} ניסוחים דומים אוחדו`
                              : ''}
                          </p>
                        </div>
                      </div>
                    </button>
                    {isExpanded ? (
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleMarkAlmog(task)}
                          className="flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-[11px] font-black text-white disabled:opacity-60"
                          style={{
                            background: 'linear-gradient(145deg, #047857, #10b981)',
                          }}
                        >
                          {busy ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          )}
                          סמן בוצע
                        </button>
                        <button
                          type="button"
                          onClick={() => openChatForAlmog(task)}
                          className="flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-[11px] font-black text-emerald-900"
                          style={{
                            background: 'rgba(167,243,208,0.45)',
                            border: '1px solid rgba(110,231,183,0.4)',
                          }}
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          מעבר לצ׳אט
                        </button>
                      </div>
                    ) : null}
                  </article>
                );
              })}

              {pendingTasks.map((task, index) => {
                const timeHint =
                  index === 0 && nextTask?.taskId === task.id
                    ? nextTask.timeHint
                    : taskTimeHintForRow(task, schedule);
                const isFeatured = index === 0 && pendingCount > 0;
                const isExpanded = expandedId === task.id;
                const busy = busyId === task.id;

                return (
                  <article
                    key={task.id}
                    className="w-full text-right rounded-2xl p-3.5"
                    style={{
                      background: isFeatured
                        ? 'linear-gradient(170deg, rgba(248,251,246,0.72) 0%, rgba(255,251,235,0.58) 100%)'
                        : 'rgba(248,251,246,0.55)',
                      border: isFeatured
                        ? '1px solid rgba(245,158,11,0.38)'
                        : '1px solid rgba(167,243,208,0.4)',
                      boxShadow: isFeatured
                        ? '0 10px 24px rgba(245,158,11,0.1), inset 0 1px 0 rgba(248,251,246,0.75)'
                        : '0 4px 14px rgba(6,78,59,0.05), inset 0 1px 0 rgba(248,251,246,0.65)',
                      backdropFilter: 'blur(12px)',
                      WebkitBackdropFilter: 'blur(12px)',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setExpandedId(isExpanded ? null : task.id)}
                      className="w-full text-right"
                      aria-expanded={isExpanded}
                      aria-label={`פתיחת אפשרויות ל${task.title}`}
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
                    {isExpanded ? (
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleMarkJourney(task)}
                          className="flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-[11px] font-black text-white disabled:opacity-60"
                          style={{
                            background: 'linear-gradient(145deg, #047857, #10b981)',
                          }}
                        >
                          {busy ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          )}
                          סמן בוצע
                        </button>
                        <button
                          type="button"
                          onClick={() => openChatForJourney(task)}
                          className="flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-[11px] font-black text-emerald-900"
                          style={{
                            background: 'rgba(167,243,208,0.45)',
                            border: '1px solid rgba(110,231,183,0.4)',
                          }}
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          מעבר לצ׳אט
                        </button>
                      </div>
                    ) : null}
                  </article>
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
                        background: 'rgba(248,251,246,0.85)',
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
                background: 'rgba(255,255,255,0.38)',
                borderTop: '1px solid rgba(167,243,208,0.32)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
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
                    אסמן בעצמי
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
                  ? 'לחיצה על משימה פותחת סימון מהיר — או מעבר לצ׳אט אם בא לך'
                  : 'יום מצוין. מחר נמשיך 🌱'}
              </p>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    getAppOverlayRoot()
  );
}
