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

  return (
    <div className="glass-card p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: 'rgba(249,115,22,0.2)', border: '1px solid rgba(249,115,22,0.3)' }}>
            <ClipboardList className="w-4 h-4 text-energy-500" />
          </div>
          <h3 className="font-bold text-white text-base">משימות השיעור</h3>
        </div>
        <span className={cn(
          'text-xs font-bold px-2.5 py-1 rounded-full',
          allDone ? 'badge-success' : 'badge-energy'
        )}>
          {completedCount}/{totalCount} {allDone ? '✅' : '⏳'}
        </span>
      </div>

      {/* Progress Bar */}
      <div className="progress-bar mb-4">
        <motion.div
          className="progress-bar-fill"
          initial={{ width: 0 }}
          animate={{ width: `${totalCount > 0 ? (completedCount / totalCount) * 100 : 0}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          style={{ background: 'linear-gradient(90deg, #f97316, #fb923c)' }}
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
              className={cn(
                'task-item w-full text-right',
                isDone && 'completed'
              )}
              aria-pressed={isDone}
              aria-label={`משימה: ${task.title}`}
            >
              <div className="flex-shrink-0 mt-0.5">
                <AnimatePresence mode="wait" initial={false}>
                  {isDone ? (
                    <motion.div key="done" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={{ type: 'spring', stiffness: 500, damping: 25 }}>
                      <CheckCircle2 className="w-5 h-5 text-secondary-400" />
                    </motion.div>
                  ) : (
                    <motion.div key="empty" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>
                      <Circle className="w-5 h-5 text-slate-600" />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <div className="flex-1 min-w-0">
                <p className={cn(
                  'text-sm font-medium leading-snug text-right',
                  isDone ? 'line-through text-slate-500' : 'text-slate-200'
                )}>
                  {task.title}
                </p>
                {task.description && !isDone && (
                  <p className="text-xs text-slate-500 mt-0.5 text-right">{task.description}</p>
                )}
              </div>
              {task.is_required && !isDone && (
                <span className="flex-shrink-0 text-xs badge-energy">חובה</span>
              )}
            </motion.button>
          );
        })}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 mt-3 text-red-400 text-xs">
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
            style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.25)' }}
          >
            <p className="text-secondary-400 font-bold text-sm">🎉 כל המשימות הושלמו! כל הכבוד!</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
