'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  CheckCircle2,
  ClipboardCheck,
  MapPin,
  MessageCircle,
  Sparkles,
  X,
  Zap,
} from 'lucide-react';
import { buildTaskDoneChatPrefill } from '../../lib/ai/almog-greeting';
import type { PendingTaskTodayRow } from '../../lib/journey/journey-report-parse';

interface TodayTasksPopupProps {
  open: boolean;
  tasks: PendingTaskTodayRow[];
  doneCount: number;
  pendingCount: number;
  onClose: () => void;
  onMarkDone: () => void;
  onOpenChat: (prefill: string) => void;
}

export function TodayTasksPopup({
  open,
  tasks,
  doneCount,
  pendingCount,
  onClose,
  onMarkDone,
  onOpenChat,
}: TodayTasksPopupProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  const pendingTasks = tasks.filter((t) => !t.done);
  const doneTasks = tasks.filter((t) => t.done);
  const firstPending = pendingTasks[0];

  const openChatForTask = (task: PendingTaskTodayRow) => {
    const slot = task.pendingSlots.find((s) => s !== 'once') ?? null;
    onClose();
    onOpenChat(buildTaskDoneChatPrefill(task.title, slot));
  };

  const openChatGeneral = () => {
    onClose();
    if (firstPending) {
      onOpenChat(buildTaskDoneChatPrefill(firstPending.title));
      return;
    }
    onOpenChat('בוא נדבר על המשימות שלי להיום');
  };

  if (!mounted) return null;

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
              background:
                'radial-gradient(120% 90% at 50% 0%, rgba(6,78,59,0.5) 0%, rgba(6,40,32,0.72) 100%)',
              backdropFilter: 'blur(10px) saturate(1.1)',
              WebkitBackdropFilter: 'blur(10px) saturate(1.1)',
            }}
          />
          <motion.div
            dir="rtl"
            className="relative w-full max-w-sm rounded-[26px] overflow-hidden flex flex-col"
            initial={{ y: 16, opacity: 0, scale: 0.94 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 16, opacity: 0, scale: 0.94 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            style={{
              maxHeight: '100%',
              background:
                'linear-gradient(168deg, rgba(236,253,245,0.9) 0%, rgba(220,252,231,0.82) 48%, rgba(254,252,232,0.82) 100%)',
              border: '1px solid rgba(255,255,255,0.55)',
              boxShadow:
                '0 36px 90px rgba(6,78,59,0.4), 0 0 0 1px rgba(167,243,208,0.45), inset 0 1px 1px rgba(255,255,255,0.95)',
              backdropFilter: 'blur(36px) saturate(1.45)',
              WebkitBackdropFilter: 'blur(36px) saturate(1.45)',
            }}
          >
            <button
              type="button"
              onClick={onClose}
              className="absolute top-3 left-3 z-10 flex h-8 w-8 items-center justify-center rounded-full text-emerald-900/80 hover:text-emerald-900"
              style={{
                background: 'rgba(220,252,231,0.6)',
                border: '1px solid rgba(167,243,208,0.6)',
              }}
              aria-label="סגירה"
            >
              <X className="w-4 h-4" />
            </button>

            <div
              className="px-5 pt-5 pb-4 text-center shrink-0"
              style={{
                background:
                  'linear-gradient(150deg, rgba(167,243,208,0.55) 0%, rgba(204,251,241,0.35) 70%)',
                borderBottom: '1px solid rgba(167,243,208,0.45)',
              }}
            >
              <p className="text-[11px] font-bold text-emerald-900/75 mb-0.5">משימות היום</p>
              <h2
                className="text-lg font-black text-emerald-950"
                style={{ fontFamily: "'Rubik','Heebo',sans-serif" }}
              >
                {pendingCount > 0
                  ? `${pendingCount} ${pendingCount === 1 ? 'משימה פתוחה' : 'משימות פתוחות'}`
                  : 'סגרת הכל להיום ✦'}
              </h2>
              {doneCount > 0 ? (
                <p className="text-[11px] text-emerald-900/75 font-semibold mt-0.5">
                  {doneCount} כבר בוצעו
                </p>
              ) : null}
            </div>

            <div className="p-4 space-y-2.5 overflow-y-auto flex-1 min-h-0">
              {pendingTasks.length === 0 && doneTasks.length === 0 ? (
                <div
                  className="rounded-2xl p-4 text-right"
                  style={{
                    background:
                      'linear-gradient(180deg, rgba(204,251,241,0.45) 0%, rgba(254,252,232,0.4) 100%)',
                    border: '1px solid rgba(167,243,208,0.4)',
                  }}
                >
                  <div className="flex items-center gap-2 justify-end mb-1">
                    <p className="text-sm font-black text-emerald-900">המסע מחכה לך</p>
                    <Sparkles className="w-4 h-4 text-emerald-700" />
                  </div>
                  <p className="text-xs text-emerald-900/80 leading-relaxed mb-3">
                    עוד לא לקחת משימות במסע. בוא נתחיל ביחד.
                  </p>
                  <button
                    type="button"
                    onClick={openChatGeneral}
                    className="w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-black text-white"
                    style={{ background: 'linear-gradient(145deg, #047857, #10b981)' }}
                  >
                    <MessageCircle className="w-4 h-4" />
                    דבר עם אלמוג
                  </button>
                </div>
              ) : null}

              {pendingTasks.map((task) => (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => openChatForTask(task)}
                  className="w-full text-right rounded-2xl p-3 transition active:scale-[0.98]"
                  style={{
                    background:
                      'linear-gradient(170deg, rgba(254,243,199,0.75) 0%, rgba(254,249,195,0.55) 100%)',
                    border: '1px solid rgba(253,224,71,0.55)',
                    boxShadow:
                      '0 6px 18px rgba(245,158,11,0.08), inset 0 1px 0 rgba(255,255,255,0.85)',
                  }}
                  aria-label={`ספר לאלמוג שסיימת את ${task.title}`}
                >
                  <div className="flex items-start gap-2.5 flex-row-reverse">
                    <div
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xl"
                      style={{
                        background:
                          'linear-gradient(145deg, rgba(254,240,138,0.85), rgba(253,224,71,0.65))',
                        border: '1px solid rgba(245,158,11,0.35)',
                      }}
                    >
                      {task.emoji}
                    </div>
                    <div className="min-w-0 flex-1 text-right">
                      <p className="text-sm font-black text-emerald-950 leading-snug line-clamp-2">
                        {task.title}
                      </p>
                      <p className="text-[10px] font-semibold text-emerald-900/70 mt-0.5 flex items-center gap-1 justify-end">
                        <span>
                          צעד {task.stepNumber}: {task.stepTitle}
                        </span>
                        <MapPin className="w-3 h-3" />
                      </p>
                      {task.pendingSlots.length > 0 && task.pendingSlots[0] !== 'once' ? (
                        <div className="flex flex-wrap gap-1.5 justify-end mt-2">
                          {task.pendingSlots.map((slot) => (
                            <span
                              key={`${task.id}-${slot}`}
                              className="text-[10px] font-bold px-2 py-0.5 rounded-full text-amber-900 inline-flex items-center gap-1"
                              style={{
                                background: 'rgba(254,240,138,0.65)',
                                border: '1px solid rgba(245,158,11,0.35)',
                              }}
                            >
                              <Zap className="w-3 h-3" />
                              {slot}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      <p className="text-[10px] font-bold text-amber-900/80 mt-2 flex items-center gap-1 justify-end">
                        <MessageCircle className="w-3 h-3" />
                        לחץ לדווח בצ׳אט
                      </p>
                    </div>
                  </div>
                </button>
              ))}

              {doneTasks.length > 0 ? (
                <>
                  <p className="text-[10px] font-bold text-emerald-900/60 px-1 pt-1">בוצעו היום</p>
                  {doneTasks.map((task) => (
                    <article
                      key={`done-${task.id}`}
                      className="rounded-2xl p-3 opacity-80"
                      style={{
                        background:
                          'linear-gradient(170deg, rgba(236,253,245,0.75) 0%, rgba(209,250,229,0.5) 100%)',
                        border: '1px solid rgba(167,243,208,0.5)',
                      }}
                    >
                      <div className="flex items-start gap-2.5 flex-row-reverse">
                        <div
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xl"
                          style={{
                            background:
                              'linear-gradient(145deg, rgba(220,252,231,0.85), rgba(254,252,232,0.65))',
                            border: '1px solid rgba(167,243,208,0.6)',
                          }}
                        >
                          {task.emoji}
                        </div>
                        <div className="min-w-0 flex-1 text-right">
                          <p className="text-sm font-black text-emerald-950 leading-snug line-clamp-2 line-through decoration-emerald-700/40">
                            {task.title}
                          </p>
                          <span
                            className="text-[10px] font-bold px-2 py-0.5 rounded-full text-emerald-900 inline-flex items-center gap-1 mt-1"
                            style={{
                              background: 'rgba(167,243,208,0.55)',
                              border: '1px solid rgba(110,231,183,0.45)',
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
              className="px-4 py-3 shrink-0 space-y-2"
              style={{
                background:
                  'linear-gradient(180deg, rgba(204,251,241,0.4) 0%, rgba(220,252,231,0.55) 100%)',
                borderTop: '1px solid rgba(167,243,208,0.45)',
              }}
            >
              {pendingCount > 0 ? (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onMarkDone();
                    }}
                    className="flex items-center justify-center gap-1.5 rounded-xl py-3 text-[11px] font-black text-white"
                    style={{
                      background: 'linear-gradient(145deg, #047857, #10b981)',
                      boxShadow: '0 8px 20px rgba(4,120,87,0.25)',
                    }}
                  >
                    <ClipboardCheck className="w-4 h-4" />
                    סמן ידנית
                  </button>
                  <button
                    type="button"
                    onClick={openChatGeneral}
                    className="flex items-center justify-center gap-1.5 rounded-xl py-3 text-[11px] font-black text-emerald-950"
                    style={{
                      background: 'rgba(255,255,255,0.72)',
                      border: '1px solid rgba(167,243,208,0.55)',
                      boxShadow: '0 4px 14px rgba(6,78,59,0.08)',
                    }}
                  >
                    <MessageCircle className="w-4 h-4 text-emerald-700" />
                    לצ׳אט אלמוג
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={openChatGeneral}
                  className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-black text-white"
                  style={{
                    background: 'linear-gradient(145deg, #047857, #10b981)',
                    boxShadow: '0 8px 20px rgba(4,120,87,0.25)',
                  }}
                >
                  <MessageCircle className="w-4 h-4" />
                  ספר לאלמוג איך מרגיש
                </button>
              )}
              <p className="text-center text-[11px] font-semibold text-emerald-900/75">
                {pendingCount > 0
                  ? 'לחיצה על משימה פותחת צ׳אט עם טקסט מוכן, אלמוג יסמן בשבילך'
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
