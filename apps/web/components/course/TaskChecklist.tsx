'use client';

import { useState, useTransition } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Circle, ClipboardList, AlertCircle } from 'lucide-react';
import { cn } from '../../lib/cn';
import type { LessonTask } from '../../lib/types/course';

interface TaskChecklistProps {
  tasks: LessonTask[];
  completedTaskIds: Record<string, boolean>;
  lessonId: string;
  onTaskToggle: (taskId: string, completed: boolean) => Promise<void>;
}

export function TaskChecklist({ tasks, completedTaskIds, lessonId, onTaskToggle }: TaskChecklistProps) {
  const [localCompleted, setLocalCompleted] = useState<Record<string, boolean>>(completedTaskIds);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!tasks.length) return null;

  const completedCount = Object.values(localCompleted).filter(Boolean).length;
  const totalCount = tasks.length;
  const allDone = completedCount === totalCount;

  const handleToggle = (taskId: string) => {
    const newValue = !localCompleted[taskId];
    setLocalCompleted(prev => ({ ...prev, [taskId]: newValue }));
    setError(null);
    startTransition(async () => {
      try {
        await onTaskToggle(taskId, newValue);
      } catch {
        setLocalCompleted(prev => ({ ...prev, [taskId]: !newValue }));
        setError('שגיאה בשמירה. נסה שנית.');
      }
    });
  };

  const pct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <div className="guide-glass-card p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: 'linear-gradient(145deg, #f59e0b, #f97316)', boxShadow: '0 4px 12px rgba(249,115,22,0.35)' }}>
            <ClipboardList className="w-4.5 h-4.5 text-white" />
          </div>
          <div>
            <h3 className="font-black text-base leading-tight" style={{ color: '#1A1730' }}>משימות הפרק</h3>
            <p className="text-xs" style={{ color: '#9896B8' }}>{completedCount} מתוך {totalCount} הושלמו</p>
          </div>
        </div>
        <span className={cn('guide-chip', allDone ? 'guide-chip-emerald' : 'guide-chip-amber')}>
          {pct}% {allDone ? '✅' : '⏳'}
        </span>
      </div>

      {/* Progress Bar */}
      <div className="relative h-2.5 rounded-full overflow-hidden mb-4" style={{ background: 'rgba(245,166,35,0.12)' }}>
        <motion.div
          className="absolute inset-y-0 right-0 rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          style={{ background: 'linear-gradient(90deg, #f59e0b, #fb923c)', boxShadow: '0 0 10px rgba(249,115,22,0.5)' }}
        />
      </div>

      {/* Tasks */}
      <div className="space-y-2">
        {tasks.map((task, idx) => {
          const isDone = !!localCompleted[task.id];
          return (
            <motion.button
              key={task.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.05 }}
              onClick={() => handleToggle(task.id)}
              className={cn('guide-task-row', isDone && 'done')}
              aria-pressed={isDone}
              aria-label={`משימה: ${task.title}`}
            >
              <div className="flex-shrink-0 mt-0.5">
                <AnimatePresence mode="wait" initial={false}>
                  {isDone ? (
                    <motion.div key="done" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={{ type: 'spring', stiffness: 500, damping: 25 }}>
                      <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                    </motion.div>
                  ) : (
                    <motion.div key="empty" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>
                      <Circle className="w-5 h-5" style={{ color: '#C7C5DC' }} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <div className="flex-1 min-w-0">
                <p className={cn('text-sm font-semibold leading-snug text-right', isDone && 'line-through')}
                  style={{ color: isDone ? '#9896B8' : '#1A1730' }}>
                  {task.title}
                </p>
                {task.description && !isDone && (
                  <p className="text-xs mt-0.5 text-right leading-relaxed" style={{ color: '#6B6890' }}>{task.description}</p>
                )}
              </div>
              {task.is_required && !isDone && (
                <span className="flex-shrink-0 guide-chip guide-chip-amber">חובה</span>
              )}
            </motion.button>
          );
        })}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 mt-3 text-red-500 text-xs">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* All done celebration */}
      <AnimatePresence>
        {allDone && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-4 text-center py-3 rounded-2xl"
            style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.32)' }}
          >
            <p className="font-bold text-sm" style={{ color: '#047857' }}>🎉 כל המשימות הושלמו! כל הכבוד!</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
