'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle2,
  Circle,
  Droplets,
  Clock,
  Footprints,
  Leaf,
  Loader2,
  Moon,
  Salad,
  LogOut,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type { ChallengeCelebration } from '@/lib/challenge/celebrations';
import type { EatingWindowStatus } from '@/lib/challenge/eating-window-status';
import type { ChallengeStateResponse } from '@/lib/challenge/types';
import { ChallengeSuccessChart } from './ChallengeSuccessChart';
import { ChallengeEatingWindowTimer } from './ChallengeEatingWindowTimer';
import { ChallengeInsightsCard } from './ChallengeInsightsCard';
import { ChallengePushBanner } from './ChallengePushBanner';
import { useChallengeOfflineSync } from '@/lib/client/useChallengeOfflineSync';
import { enqueuePendingCompletion } from '@/lib/challenge/offline-queue';
import { challengeCelebrationProps } from '@/lib/challenge/motion';
import { useReducedMotion } from '@/lib/client/useReducedMotion';

type TaskSlot = {
  slot_key: string;
  label: string;
  meal_time: string | null;
  completed: boolean;
};

type TaskRow = {
  id: string;
  task_key: string;
  title_he: string;
  description_he: string | null;
  schedule_type: string;
  icon: string | null;
  celebration_key: string | null;
  completed: boolean;
  slots?: TaskSlot[];
};

const ICON_MAP: Record<string, typeof Droplets> = {
  droplets: Droplets,
  'glass-water': Droplets,
  clock: Clock,
  footprints: Footprints,
  leaf: Leaf,
  salad: Salad,
  moon: Moon,
};

const CELEBRATION_GRADIENT: Record<string, string> = {
  water: 'from-secondary-500/30 to-secondary-500/20 border-secondary-400/40',
  movement: 'from-energy-500/30 to-accent-500/20 border-energy-400/40',
  food: 'from-primary-500/30 to-primary-500/20 border-primary-400/40',
  moon: 'from-iris-500/30 to-iris-500/20 border-iris-400/40',
  day_complete: 'from-accent-500/40 to-primary-500/30 border-accent-400/50',
  default: 'from-primary-500/30 to-secondary-500/20 border-primary-400/40',
};

type Props = {
  initialState: ChallengeStateResponse;
};

export function ChallengeDashboardClient({ initialState }: Props) {
  const [state] = useState(initialState);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [dayIndex, setDayIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState<string | null>(null);
  const [celebration, setCelebration] = useState<ChallengeCelebration | null>(null);
  const [eatingWindowStatus, setEatingWindowStatus] = useState<EatingWindowStatus | null>(null);
  const [expandedTask, setExpandedTask] = useState<string | null>(null);
  const reducedMotion = useReducedMotion();
  const celebrationMotion = challengeCelebrationProps(reducedMotion);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/challenge/tasks', { credentials: 'include' });
      const data = await res.json();
      setTasks(data.tasks ?? []);
      setDayIndex(data.day_index ?? 0);
      setEatingWindowStatus(data.eating_window_status ?? null);
    } finally {
      setLoading(false);
    }
  }, []);

  const { pending: pendingOffline, syncing, sync } = useChallengeOfflineSync(loadTasks);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const completeTask = async (taskId: string, slotKey?: string) => {
    const key = slotKey ? `${taskId}:${slotKey}` : taskId;
    setCompleting(key);
    try {
      const res = await fetch('/api/v1/challenge/tasks', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task_definition_id: taskId,
          slot_key: slotKey ?? null,
        }),
      });
      if (!res.ok) throw new Error('request_failed');
      const data = await res.json();
      if (data.celebration) {
        setCelebration(data.celebration);
        setTimeout(() => setCelebration(null), 3400);
      }
      await loadTasks();
    } catch {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        enqueuePendingCompletion(taskId, slotKey ?? null);
      }
    } finally {
      setCompleting(null);
    }
  };

  const exitDemo = async () => {
    await fetch('/api/v1/admin/challenge/demo', { method: 'DELETE', credentials: 'include' });
    window.location.href = '/home';
  };

  const requiredUnits = tasks.reduce((n, t) => {
    if (t.schedule_type === 'per_meal' && t.slots?.length) return n + t.slots.length;
    return n + 1;
  }, 0);

  const doneUnits = tasks.reduce((n, t) => {
    if (t.schedule_type === 'per_meal' && t.slots?.length) {
      return n + t.slots.filter((s) => s.completed).length;
    }
    return n + (t.completed ? 1 : 0);
  }, 0);

  const progress = requiredUnits ? Math.round((doneUnits / requiredUnits) * 100) : 0;

  return (
    <div className="min-h-dvh bg-linear-to-b from-[#05010f] via-[#0a1628] to-[#05010f] text-on-dark" dir="rtl">
      <AnimatePresence>
        {celebration ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-forest-950/70 backdrop-blur-sm px-4"
          >
            <motion.div
              {...celebrationMotion}
              className={`max-w-sm rounded-3xl border bg-linear-to-br px-8 py-10 text-center backdrop-blur-xl ${
                CELEBRATION_GRADIENT[celebration.variant] ?? CELEBRATION_GRADIENT.default
              }`}
            >
              <div className="text-5xl">{celebration.emoji}</div>
              <h2 className="mt-4 font-display text-2xl font-black">{celebration.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-on-dark/75">{celebration.subtitle}</p>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div className="mx-auto max-w-lg px-4 pb-24 pt-6">
        {state.is_demo ? (
          <div className="mb-4 flex items-center justify-between gap-2 rounded-2xl border border-accent-400/40 bg-accent-500/10 px-4 py-3">
            <span className="text-sm text-accent-100">מצב דemo</span>
            <button
              type="button"
              onClick={exitDemo}
              className="inline-flex items-center gap-1 rounded-xl bg-background-card/10 px-3 py-1.5 text-xs font-semibold"
            >
              <LogOut className="h-3.5 w-3.5" />
              יציאה
            </button>
          </div>
        ) : null}

        <ChallengePushBanner />

        {pendingOffline > 0 ? (
          <div className="mb-4 flex items-center justify-between gap-2 rounded-2xl border border-accent-400/40 bg-accent-500/10 px-4 py-3 text-sm text-accent-100">
            <span>{pendingOffline} סימונים ממתינים לסנכרון</span>
            <button
              type="button"
              disabled={syncing}
              onClick={() => void sync()}
              className="rounded-lg bg-background-card/10 px-3 py-1 text-xs font-semibold"
            >
              {syncing ? 'מסנכרן...' : 'סנכרן עכשיו'}
            </button>
          </div>
        ) : null}

        <header className="mb-6">
          <p className="text-sm text-primary-300/80">אתגר 14 יום</p>
          <h1 className="font-display text-2xl font-black">
            יום {dayIndex} מתוך {state.days_total}
          </h1>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-background-card/10">
            <motion.div
              className="h-full rounded-full bg-linear-to-l from-primary-400 to-secondary-500"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-on-dark/45">
            {doneUnits} מתוך {requiredUnits} סימונים היום
          </p>
        </header>

        <ChallengeEatingWindowTimer initialStatus={eatingWindowStatus} />

        <div className="mt-6">
          <ChallengeSuccessChart />
        </div>

        <ChallengeInsightsCard />

        <section className="mt-6 space-y-3">
          <h2 className="text-sm font-bold text-on-dark/60">משימות היום</h2>
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary-400" />
            </div>
          ) : (
            tasks.map((task) => {
              const Icon = ICON_MAP[task.icon ?? ''] ?? Circle;
              const hasSlots = task.schedule_type === 'per_meal' && (task.slots?.length ?? 0) > 0;
              const isExpanded = expandedTask === task.id;

              if (hasSlots) {
                const doneSlots = task.slots!.filter((s) => s.completed).length;
                return (
                  <div
                    key={task.id}
                    className={`rounded-2xl border transition-colors ${
                      task.completed
                        ? 'border-primary-500/30 bg-primary-500/10'
                        : 'border-on-dark/10 bg-background-card/5'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setExpandedTask(isExpanded ? null : task.id)}
                      className="flex w-full items-start gap-3 p-4 text-start"
                    >
                      <div className="mt-0.5 shrink-0">
                        {task.completed ? (
                          <CheckCircle2 className="h-6 w-6 text-primary-400" />
                        ) : (
                          <Icon className="h-6 w-6 text-on-dark/40" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold">{task.title_he}</div>
                        <p className="mt-1 text-xs text-on-dark/45">
                          {doneSlots}/{task.slots!.length} ארוחות
                        </p>
                      </div>
                      {isExpanded ? (
                        <ChevronUp className="h-5 w-5 text-on-dark/40" />
                      ) : (
                        <ChevronDown className="h-5 w-5 text-on-dark/40" />
                      )}
                    </button>
                    {isExpanded ? (
                      <div className="space-y-2 border-t border-on-dark/10 px-3 pb-3 pt-2">
                        {task.slots!.map((slot) => (
                          <button
                            key={slot.slot_key}
                            type="button"
                            disabled={slot.completed || completing === `${task.id}:${slot.slot_key}`}
                            onClick={() => !slot.completed && completeTask(task.id, slot.slot_key)}
                            className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm ${
                              slot.completed
                                ? 'bg-primary-500/15 text-primary-200'
                                : 'bg-forest-950/20 active:bg-background-card/10'
                            }`}
                          >
                            <span>{slot.label}</span>
                            {slot.completed ? (
                              <CheckCircle2 className="h-4 w-4" />
                            ) : completing === `${task.id}:${slot.slot_key}` ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Circle className="h-4 w-4 text-on-dark/30" />
                            )}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              }

              return (
                <motion.button
                  key={task.id}
                  type="button"
                  disabled={task.completed || completing === task.id}
                  onClick={() => !task.completed && completeTask(task.id)}
                  whileTap={{ scale: 0.98 }}
                  className={`flex w-full items-start gap-3 rounded-2xl border p-4 text-start transition-colors ${
                    task.completed
                      ? 'border-primary-500/30 bg-primary-500/10'
                      : 'border-on-dark/10 bg-background-card/5 active:bg-background-card/10'
                  }`}
                >
                  <div className="mt-0.5 shrink-0">
                    {task.completed ? (
                      <CheckCircle2 className="h-6 w-6 text-primary-400" />
                    ) : completing === task.id ? (
                      <Loader2 className="h-6 w-6 animate-spin text-on-dark/50" />
                    ) : (
                      <Icon className="h-6 w-6 text-on-dark/40" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">{task.title_he}</div>
                    {task.description_he ? (
                      <p className="mt-1 text-sm text-on-dark/50">{task.description_he}</p>
                    ) : null}
                  </div>
                </motion.button>
              );
            })
          )}
        </section>
      </div>
    </div>
  );
}
