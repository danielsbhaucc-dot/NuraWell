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
import { buildTaskDoneChatPrefill } from '../../lib/ai/almog-greeting';
import {
  buildTaskReportHintFromPendingRow,
  type TaskReportHint,
} from '../../lib/ai/task-report-hint';
import { slotLabel } from '../../lib/journey/task-schedule';
import { pickNextTaskForNow } from '../../lib/journey/pick-next-task-for-now';
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
  useEffect(() => setMounted(true), []);

  useDialogA11y({
    open,
    onClose,
    containerRef: dialogRef,
  });

  const pendingTasks = useMemo(() => {
    const open = tasks.filter((t) => !t.done);
    const next = pickNextTaskForNow(open, userSchedule ?? {});
    if (!next) return open;
    return [...open].sort((a, b) => {
      if (a.id === next.taskId) return -1;
      if (b.id === next.taskId) return 1;
      return a.stepNumber - b.stepNumber;
    });
  }, [tasks, userSchedule]);

  const doneTasks = tasks.filter((t) => t.done);
  const firstPending = pendingTasks[0];
  const name = firstName.trim();

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

  const headerSubtitle =
    pendingCount > 0
      ? name
        ? `${name}, בוא נסגור את מה שפתוח`
        : 'בוא נסגור את מה שפתוח'
      : name
        ? `${name}, יפה מאוד היום ✦`
        : 'יפה מאוד היום ✦';

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
            style={{
              background: 'rgba(6,40,32,0.55)',
            }}
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
                'linear-gradient(168deg, rgba(255,255,255,0.72) 0%, rgba(236,253,245,0.58) 55%, rgba(255,255,255,0.65) 100%)',
              border: '1px solid rgba(255,255,255,0.72)',
              boxShadow:
                '0 32px 80px rgba(6,78,59,0.28), inset 0 1px 1px rgba(255,255,255,0.95)',
              backdropFilter: 'blur(40px) saturate(1.6)',
              WebkitBackdropFilter: 'blur(40px) saturate(1.6)',
            }}
          >
            <button
              type="button"
              onClick={onClose}
              className="absolute top-3.5 left-3.5 z-10 flex h-8 w-8 items-center justify-center rounded-full text-emerald-900/70 hover:text-emerald-950 transition-colors"
              style={{
                background: 'rgba(255,255,255,0.55)',
                border: '1px solid rgba(255,255,255,0.8)',
                boxShadow: '0 2px 8px rgba(6,78,59,0.08)',
              }}
              aria-label="סגירה"
            >
              <X className="w-4 h-4" />
            </button>

            <div
              className="px-5 pt-6 pb-4 shrink-0 text-right"
              style={{
                background:
                  'linear-gradient(150deg, rgba(255,255,255,0.45) 0%, rgba(167,243,208,0.28) 100%)',
                borderBottom: '1px solid rgba(255,255,255,0.55)',
              }}
            >
              <p className="text-[10px] font-bold tracking-wide text-emerald-800/65 mb-1">
                המשימות שלך להיום
              </p>
              <h2
                id={titleId}
                className="text-xl font-black text-emerald-950 leading-tight"
                style={{ fontFamily: "'Rubik','Heebo',sans-serif" }}
              >
                {headerSubtitle}
              </h2>
              {pendingCount > 0 ? (
                <p className="text-xs text-emerald-900/75 font-semibold mt-1.5 leading-relaxed">
                  {pendingCount === 1
                    ? 'משימה אחת פתוחה'
                    : `${pendingCount} משימות פתוחות`}
                  {doneCount > 0 ? ` · ${doneCount} כבר בוצעו` : ''}
                </p>
              ) : doneCount > 0 ? (
                <p className="text-xs text-emerald-900/75 font-semibold mt-1.5">
                  {doneCount} {doneCount === 1 ? 'משימה בוצעה' : 'משימות בוצעו'} היום
                </p>
              ) : null}
            </div>

            <div className="p-4 space-y-2.5 overflow-y-auto flex-1 min-h-0">
              {pendingTasks.length === 0 && doneTasks.length === 0 ? (
                <div
                  className="rounded-2xl p-4 text-right"
                  style={{
                    background: 'rgba(255,255,255,0.5)',
                    border: '1px solid rgba(255,255,255,0.75)',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.9)',
                  }}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
                    <p className="text-sm font-black text-emerald-900">המסע מחכה לך</p>
                  </div>
                  <p className="text-xs text-emerald-900/80 leading-relaxed mb-3">
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

              {pendingTasks.map((task, index) => (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => openChatForTask(task)}
                  className="w-full text-right rounded-2xl p-3.5 transition active:scale-[0.98]"
                  style={{
                    background:
                      index === 0
                        ? 'linear-gradient(170deg, rgba(255,255,255,0.72) 0%, rgba(254,249,195,0.55) 100%)'
                        : 'rgba(255,255,255,0.52)',
                    border:
                      index === 0
                        ? '1px solid rgba(253,224,71,0.5)'
                        : '1px solid rgba(255,255,255,0.75)',
                    boxShadow:
                      index === 0
                        ? '0 8px 22px rgba(245,158,11,0.1), inset 0 1px 0 rgba(255,255,255,0.9)'
                        : 'inset 0 1px 0 rgba(255,255,255,0.85)',
                  }}
                  aria-label={`ספר לאלמוג שסיימת את ${task.title}`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xl"
                      style={{
                        background:
                          index === 0
                            ? 'linear-gradient(145deg, rgba(254,240,138,0.9), rgba(253,224,71,0.7))'
                            : 'rgba(236,253,245,0.85)',
                        border:
                          index === 0
                            ? '1px solid rgba(245,158,11,0.3)'
                            : '1px solid rgba(167,243,208,0.45)',
                      }}
                    >
                      {task.emoji}
                    </div>
                    <div className="min-w-0 flex-1">
                      {index === 0 && pendingCount > 0 ? (
                        <span
                          className="inline-block text-[9px] font-bold text-amber-900 mb-1 px-2 py-0.5 rounded-full"
                          style={{
                            background: 'rgba(254,240,138,0.65)',
                            border: '1px solid rgba(245,158,11,0.25)',
                          }}
                        >
                          מומלץ עכשיו
                        </span>
                      ) : null}
                      <p className="text-sm font-black text-emerald-950 leading-snug">
                        {task.title}
                      </p>
                      <p className="text-[10px] font-medium text-emerald-900/65 mt-0.5">
                        {task.stepTitle} · צעד {task.stepNumber}
                      </p>
                      {task.pendingSlots.length > 0 && task.pendingSlots[0] !== 'once' ? (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {task.pendingSlots.map((slotKey) => (
                            <span
                              key={`${task.id}-${slotKey}`}
                              className="text-[10px] font-semibold px-2 py-0.5 rounded-full text-emerald-900"
                              style={{
                                background: 'rgba(167,243,208,0.45)',
                                border: '1px solid rgba(110,231,183,0.35)',
                              }}
                            >
                              {slotKey === 'once'
                                ? 'להיום'
                                : slotLabel(slotKey as JourneyTaskSlot)}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </button>
              ))}

              {doneTasks.length > 0 ? (
                <>
                  <p className="text-[10px] font-bold text-emerald-900/55 px-1 pt-1">כבר סגרת היום</p>
                  {doneTasks.map((task) => (
                    <article
                      key={`done-${task.id}`}
                      className="rounded-2xl p-3.5 opacity-85"
                      style={{
                        background: 'rgba(255,255,255,0.45)',
                        border: '1px solid rgba(255,255,255,0.7)',
                      }}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xl"
                          style={{
                            background: 'rgba(236,253,245,0.85)',
                            border: '1px solid rgba(167,243,208,0.5)',
                          }}
                        >
                          {task.emoji}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-black text-emerald-950 leading-snug line-through decoration-emerald-700/35">
                            {task.title}
                          </p>
                          <span
                            className="text-[10px] font-bold px-2 py-0.5 rounded-full text-emerald-900 inline-flex items-center gap-1 mt-1"
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
                background:
                  'linear-gradient(180deg, rgba(255,255,255,0.35) 0%, rgba(236,253,245,0.45) 100%)',
                borderTop: '1px solid rgba(255,255,255,0.6)',
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
              <p className="text-center text-[11px] font-medium text-emerald-900/70 leading-relaxed">
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
