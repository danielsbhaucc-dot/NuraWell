'use client';

import { useState, useTransition } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Flame, CheckCircle2 } from 'lucide-react';
import { cn } from '../../lib/cn';
import type { LessonHabit } from '../../lib/types/course';

interface HabitTrackerProps {
  habits: LessonHabit[];
  habitProgress: Record<string, boolean[]>;
  lessonId: string;
  onHabitToggle: (habitId: string, dayIndex: number, completed: boolean) => Promise<void>;
}

const DAY_LABELS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];
const DAYS_TO_SHOW = 7;

export function HabitTracker({ habits, habitProgress, lessonId, onHabitToggle }: HabitTrackerProps) {
  const [localProgress, setLocalProgress] = useState<Record<string, boolean[]>>(habitProgress);
  const [isPending, startTransition] = useTransition();

  if (!habits.length) return null;

  const todayIndex = new Date().getDay();

  const handleToggle = (habitId: string, dayIdx: number) => {
    const current = localProgress[habitId] || Array(DAYS_TO_SHOW).fill(false);
    const newValue = !current[dayIdx];
    const newDays = [...current];
    newDays[dayIdx] = newValue;
    setLocalProgress(prev => ({ ...prev, [habitId]: newDays }));
    startTransition(async () => {
      try {
        await onHabitToggle(habitId, dayIdx, newValue);
      } catch {
        const reverted = [...newDays];
        reverted[dayIdx] = !newValue;
        setLocalProgress(prev => ({ ...prev, [habitId]: reverted }));
      }
    });
  };

  return (
    <div className="glass-card p-5">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center"
          style={{ background: 'rgba(249,115,22,0.2)', border: '1px solid rgba(249,115,22,0.3)' }}>
          <Flame className="w-4 h-4 text-energy-500" />
        </div>
        <h3 className="font-bold text-white text-base">מעקב הרגלים 🔥</h3>
      </div>

      {/* Day Headers */}
      <div className="grid grid-cols-8 gap-1 mb-3">
        <div /> {/* Habit name column */}
        {DAY_LABELS.map((d, i) => (
          <div key={i} className={cn(
            'text-center text-xs font-bold py-1 rounded-lg',
            i === todayIndex ? 'text-primary-400' : 'text-slate-600'
          )}>
            {d}
            {i === todayIndex && (
              <div className="w-1 h-1 rounded-full bg-primary-400 mx-auto mt-0.5" />
            )}
          </div>
        ))}
      </div>

      {/* Habits */}
      <div className="space-y-3">
        {habits.map((habit) => {
          const days = localProgress[habit.id] || Array(DAYS_TO_SHOW).fill(false);
          const streak = calculateStreak(days, todayIndex);
          const completedThisWeek = days.filter(Boolean).length;

          return (
            <div key={habit.id} className="grid grid-cols-8 gap-1 items-center">
              {/* Name */}
              <div className="flex items-center gap-1 min-w-0">
                <span className="text-lg flex-shrink-0">{habit.emoji || '✅'}</span>
              </div>

              {/* Day rings */}
              {DAY_LABELS.map((_, dayIdx) => {
                const isDone = days[dayIdx] ?? false;
                const isToday = dayIdx === todayIndex;
                const isFuture = dayIdx > todayIndex;

                return (
                  <motion.button
                    key={dayIdx}
                    whileTap={{ scale: 0.85 }}
                    onClick={() => !isFuture && handleToggle(habit.id, dayIdx)}
                    disabled={isFuture}
                    className={cn(
                      'habit-ring w-full aspect-square rounded-full text-sm mx-auto',
                      isDone && 'done',
                      isToday && !isDone && 'ring-2 ring-primary-500/50',
                      isFuture && 'opacity-30 cursor-not-allowed'
                    )}
                    aria-label={`${habit.title} - יום ${DAY_LABELS[dayIdx]}`}
                    aria-pressed={isDone}
                  >
                    <AnimatePresence mode="wait" initial={false}>
                      {isDone ? (
                        <motion.span
                          key="done"
                          initial={{ scale: 0, rotate: -30 }}
                          animate={{ scale: 1, rotate: 0 }}
                          exit={{ scale: 0 }}
                          transition={{ type: 'spring', stiffness: 500, damping: 20 }}
                        >
                          <CheckCircle2 className="w-4 h-4 text-secondary-400" />
                        </motion.span>
                      ) : (
                        <motion.div
                          key="empty"
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className="w-2 h-2 rounded-full"
                          style={{ background: isToday ? 'rgba(20,184,166,0.5)' : 'rgba(255,255,255,0.15)' }}
                        />
                      )}
                    </AnimatePresence>
                  </motion.button>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Habit labels below */}
      <div className="mt-3 space-y-1">
        {habits.map((habit) => {
          const days = localProgress[habit.id] || Array(DAYS_TO_SHOW).fill(false);
          const completedThisWeek = days.filter(Boolean).length;
          const streak = calculateStreak(days, todayIndex);
          return (
            <div key={`label-${habit.id}`} className="flex items-center justify-between px-1">
              <span className="text-slate-300 text-xs font-medium">{habit.title}</span>
              <div className="flex items-center gap-2">
                {streak > 1 && (
                  <span className="text-xs badge-energy">🔥 {streak} ימים</span>
                )}
                <span className="text-xs text-slate-500">{completedThisWeek}/7</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function calculateStreak(days: boolean[], todayIdx: number): number {
  let streak = 0;
  for (let i = todayIdx; i >= 0; i--) {
    if (days[i]) streak++;
    else break;
  }
  return streak;
}
