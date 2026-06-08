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
    <div className="guide-glass-card p-5">
      {/* Header */}
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ background: 'linear-gradient(145deg, #f59e0b, #f97316)', boxShadow: '0 4px 12px rgba(249,115,22,0.35)' }}>
          <Flame className="w-4.5 h-4.5 text-white" />
        </div>
        <div>
          <h3 className="font-black text-white text-base leading-tight">מעקב הרגלים</h3>
          <p className="text-xs text-white/65">סמנו כל יום שעמדתם בו</p>
        </div>
      </div>

      {/* Day Headers */}
      <div className="grid grid-cols-8 gap-1.5 mb-2.5">
        <div /> {/* Habit name column */}
        {DAY_LABELS.map((d, i) => (
          <div key={i} className={cn(
            'text-center text-xs font-black py-1 rounded-lg',
            i === todayIndex ? 'text-teal-200' : 'text-white/55'
          )}>
            {d}
          </div>
        ))}
      </div>

      {/* Habits */}
      <div className="space-y-3.5">
        {habits.map((habit) => {
          const days = localProgress[habit.id] || Array(DAYS_TO_SHOW).fill(false);
          const streak = calculateStreak(days, todayIndex);
          const completedThisWeek = days.filter(Boolean).length;

          return (
            <div key={habit.id}>
              <div className="grid grid-cols-8 gap-1.5 items-center">
                {/* Emoji */}
                <div className="flex items-center justify-center">
                  <span className="text-xl flex-shrink-0">{habit.emoji || '✅'}</span>
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
                        'guide-day-ring',
                        isDone && 'done',
                        isToday && !isDone && 'today',
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
                            <CheckCircle2 className="w-4 h-4 text-white" />
                          </motion.span>
                        ) : (
                          <motion.div
                            key="empty"
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="w-1.5 h-1.5 rounded-full"
                            style={{ background: isToday ? 'rgba(94,234,212,0.8)' : 'rgba(255,255,255,0.25)' }}
                          />
                        )}
                      </AnimatePresence>
                    </motion.button>
                  );
                })}
              </div>

              {/* Label row */}
              <div className="flex items-center justify-between px-1 mt-1.5">
                <span className="text-white text-sm font-bold">{habit.title}</span>
                <div className="flex items-center gap-1.5">
                  {streak > 1 && (
                    <span className="guide-chip guide-chip-amber">🔥 {streak} ימים</span>
                  )}
                  <span className="guide-chip guide-chip-emerald">{completedThisWeek}/7</span>
                </div>
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
