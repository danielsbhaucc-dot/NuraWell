'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Drawer } from 'vaul';
import { ClipboardCheck, Leaf, Loader2, Sparkles } from 'lucide-react';
import { emojiFromWellnessText } from '../../lib/emoji-from-text';
import { parseJourneyReportItems } from '../../lib/journey/journey-report-parse';
import type { JourneyTask, JourneyTaskSlot, JourneyTaskExecution } from '../../lib/types/journey';
import {
  resolveTaskSchedule,
  scheduleLabel,
  type UserMealProfile,
} from '../../lib/journey/task-schedule';
import { TaskDailySlots } from '../journey/TaskDailySlots';
import { HabitProgressCard } from '../journey/HabitProgressCard';
import { TaskLevelProgressCard } from '../journey/TaskLevelProgressCard';
import { computeHabitProgressSnapshot } from '../../lib/journey/habit-progress';
import { computeTaskLevelProgressSnapshot } from '../../lib/journey/task-level-progress';
import { parseJourneyTasksFull } from '../../lib/journey/journey-report-parse';
import type { JourneyHabit } from '../../lib/types/journey';

type TaskStatus = 'accepted' | 'rejected' | 'pending';

type ReportProgress = {
  task_statuses?: Record<string, { status: TaskStatus; decided_at?: string | null; execution_done?: boolean }>;
  habits_progress?: Record<string, boolean[]>;
  habit_meta?: unknown;
  task_level_meta?: unknown;
};

type ReportStep = {
  id: string;
  title: string;
  step_number: number;
  tasks: unknown;
  habits: unknown;
  progress: ReportProgress | null;
};

type TodayExecutionRow = Pick<
  JourneyTaskExecution,
  'step_id' | 'task_id' | 'slot' | 'date_key' | 'completed_at' | 'source'
> & { outcome?: string | null };

type JourneyReportResponse = {
  steps: ReportStep[];
  today_executions?: TodayExecutionRow[];
  recent_executions?: TodayExecutionRow[];
  today_date_key?: string;
};

function parseHabitItems(raw: unknown): JourneyHabit[] {
  if (!Array.isArray(raw)) return [];
  const out: JourneyHabit[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const id = typeof row.id === 'string' ? row.id : '';
    const title = typeof row.title === 'string' ? row.title : '';
    if (!id || !title) continue;
    const freq = row.frequency;
    out.push({
      id,
      title,
      description: typeof row.description === 'string' ? row.description : null,
      emoji: typeof row.emoji === 'string' ? row.emoji : '🌿',
      frequency:
        freq === 'weekly' || freq === 'per_meal' ? (freq as 'weekly' | 'per_meal') : 'daily',
      weekly_day: typeof row.weekly_day === 'number' ? row.weekly_day : null,
      meal_timing: row.meal_timing === 'after' ? 'after' : 'before',
      meal_target: row.meal_target === 'all' ? 'all' : 'fixed',
      target_days:
        typeof row.target_days === 'number' && row.target_days >= 3 ? row.target_days : null,
    });
  }
  return out;
}

/** כרטיסיית ראשית במגירת הדיווח — עדכון ביצוע משימות; השנייה — הרגלים */
export type ProgressReportTabId = 'task_execution' | 'habits';

const parseItems = parseJourneyReportItems;

/** פירוק עשיר של JSONB tasks — כולל schedule/times_per_day לצורך תצוגת slots. */
function parseTaskItems(raw: unknown): JourneyTask[] {
  if (!Array.isArray(raw)) return [];
  const out: JourneyTask[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const id = typeof row.id === 'string' ? row.id : '';
    const title = typeof row.title === 'string' ? row.title : '';
    if (!id || !title) continue;
    out.push({
      id,
      title,
      description: typeof row.description === 'string' ? row.description : null,
      emoji: typeof row.emoji === 'string' ? row.emoji : '✅',
      schedule:
        row.schedule === 'daily' ||
        row.schedule === 'multi_daily' ||
        row.schedule === 'weekly' ||
        row.schedule === 'per_meal'
          ? row.schedule
          : 'one_time',
      times_per_day:
        typeof row.times_per_day === 'number' && row.times_per_day >= 1 && row.times_per_day <= 6
          ? row.times_per_day
          : null,
      weekly_day:
        typeof row.weekly_day === 'number' && row.weekly_day >= 0 && row.weekly_day <= 6
          ? row.weekly_day
          : null,
    });
  }
  return out;
}

type ProgressReportContextValue = {
  /** פותח את המגירה; אופציונלי — כרטיסייה ראשונה (ברירת מחדל: עדכון ביצוע משימות) */
  open: (tab?: ProgressReportTabId) => void;
  close: () => void;
  isOpen: boolean;
};

const ProgressReportContext = createContext<ProgressReportContextValue | null>(null);

export function useProgressReport(): ProgressReportContextValue {
  const ctx = useContext(ProgressReportContext);
  if (!ctx) throw new Error('ProgressReportProvider חסר בעץ הקומפוננטות');
  return ctx;
}

export function ProgressReportProvider({
  userId: _userId,
  userMealProfile = null,
  children,
}: {
  userId: string;
  userMealProfile?: UserMealProfile | null;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ProgressReportTabId>('task_execution');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<JourneyReportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/journey-report', { cache: 'no-store' });
      const json = (await res.json()) as JourneyReportResponse & { error?: string };
      if (!res.ok) throw new Error(json.error || 'טעינה נכשלה');
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const saveTaskExecution = useCallback(
    async (stepId: string, taskId: string, done: boolean, progress: ReportProgress | null) => {
      const ts = progress?.task_statuses?.[taskId];
      if (!ts || ts.status !== 'accepted') return;
      setSaving(taskId);
      try {
        const res = await fetch('/api/v1/journey-progress', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            step_id: stepId,
            task_statuses: {
              ...(progress?.task_statuses ?? {}),
              [taskId]: {
                ...ts,
                execution_done: done,
              },
            },
          }),
        });
        if (!res.ok) {
          const json = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(json?.error || 'שמירת ביצוע נכשלה');
        }
        if (done) {
          void fetch('/api/v1/almog-task-celebration', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ step_id: stepId, task_id: taskId }),
          }).catch(() => {});
        }
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'שגיאה בשמירה');
      } finally {
        setSaving(null);
      }
    },
    [load]
  );

  const value: ProgressReportContextValue = {
    open: (tab) => {
      setActiveTab(tab ?? 'task_execution');
      setOpen(true);
    },
    close: () => setOpen(false),
    isOpen: open,
  };

  /** קיבוץ ביצועי היום לפי step_id — מאיץ לתצוגת TaskDailySlots */
  const stepExecutionsByStep = useMemo(() => {
    const m = new Map<string, TodayExecutionRow[]>();
    for (const e of data?.today_executions ?? []) {
      const arr = m.get(e.step_id) ?? [];
      arr.push(e);
      m.set(e.step_id, arr);
    }
    return m;
  }, [data?.today_executions]);

  return (
    <ProgressReportContext.Provider value={value}>
      {children}

      <Drawer.Root open={open} onOpenChange={setOpen} direction="bottom" shouldScaleBackground>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 z-[220] bg-emerald-950/40 backdrop-blur-[2px]" />
          <Drawer.Content
            dir="rtl"
            className="fixed bottom-0 right-0 left-0 z-[230] mx-auto flex w-full max-w-md flex-col rounded-t-[28px] outline-none"
            style={{
              height: 'min(90dvh, 720px)',
              border: '1px solid rgba(255,255,255,0.35)',
              background:
                'linear-gradient(165deg, rgba(255,255,255,0.42) 0%, rgba(236,253,245,0.55) 45%, rgba(255,255,255,0.38) 100%)',
              boxShadow: '0 -20px 50px rgba(6,78,59,0.18)',
              backdropFilter: 'blur(22px)',
              WebkitBackdropFilter: 'blur(22px)',
            }}
          >
            <Drawer.Title className="sr-only">דיווח התקדמות</Drawer.Title>
            <Drawer.Description className="sr-only">
              סמן משימות והרגלים שביצעת היום
            </Drawer.Description>

            <div className="shrink-0 pt-2.5 pb-2 flex justify-center">
              <div className="h-1.5 w-11 rounded-full bg-emerald-800/25" />
            </div>

            <div
              className="shrink-0 px-4 pb-2 text-right"
              style={{ borderBottom: '1px solid rgba(6,78,59,0.08)' }}
            >
              <div className="flex items-center gap-2 justify-end">
                <div
                  className="flex h-11 w-11 items-center justify-center rounded-2xl text-white shadow-md"
                  style={{ background: 'linear-gradient(145deg, #047857, #10b981)' }}
                >
                  <ClipboardCheck className="h-5 w-5" strokeWidth={2.2} />
                </div>
                <div className="min-w-0">
                  <p className="text-lg font-black text-[#1A1730]" style={{ fontFamily: "'Rubik','Heebo',sans-serif" }}>
                    דיווח מהיר
                  </p>
                  <p className="text-xs font-semibold text-emerald-900/70">
                    בחרו כרטיסייה — עדכון משימות או מעקב הרגלים
                  </p>
                </div>
              </div>
            </div>

            <div className="shrink-0 px-3 pt-3 pb-2">
              <div
                className="glass-inset flex gap-1 rounded-[22px] p-1"
                role="tablist"
                aria-label="סוג דיווח"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'task_execution'}
                  onClick={() => setActiveTab('task_execution')}
                  className={`min-h-[42px] flex-1 rounded-[16px] px-2 py-2 text-center text-[11px] font-black leading-tight transition sm:text-xs ${
                    activeTab === 'task_execution'
                      ? 'bg-gradient-to-l from-emerald-600 to-teal-500 text-white shadow-md shadow-emerald-900/25 ring-1 ring-white/25'
                      : 'text-emerald-900/88 hover:bg-white/45'
                  }`}
                >
                  עדכון ביצוע משימות
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'habits'}
                  onClick={() => setActiveTab('habits')}
                  className={`min-h-[42px] flex-1 rounded-[16px] px-2 py-2 text-center text-[11px] font-black leading-tight transition sm:text-xs ${
                    activeTab === 'habits'
                      ? 'bg-gradient-to-l from-emerald-600 to-teal-500 text-white shadow-md shadow-emerald-900/25 ring-1 ring-white/25'
                      : 'text-emerald-900/88 hover:bg-white/45'
                  }`}
                >
                  מעקב הרגלים
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-8 pt-1 scrollbar-hide">
              {loading && (
                <div className="flex justify-center py-16 text-emerald-800">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              )}
              {error && (
                <p className="text-center text-sm text-red-700 py-10 px-4">{error}</p>
              )}
              {!loading && !error && data && (
                <div className="space-y-5 pb-4">
                  {activeTab === 'task_execution' && (
                    <>
                      {data.steps.map((step) => {
                        const tasks = parseTaskItems(step.tasks);
                        const prog = step.progress;
                        const acceptedTasks = tasks.filter((t) => prog?.task_statuses?.[t.id]?.status === 'accepted');
                        if (acceptedTasks.length === 0) return null;
                        const stepExecutions = stepExecutionsByStep.get(step.id) ?? [];
                        return (
                          <div
                            key={step.id}
                            dir="rtl"
                            className="glass-surface relative overflow-hidden rounded-[22px] px-3 py-3"
                          >
                            {/* ✦ קו אור עליון */}
                            <span
                              aria-hidden
                              className="pointer-events-none absolute inset-x-4 top-px h-px"
                              style={{
                                background:
                                  'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)',
                              }}
                            />
                            <div className="relative flex items-center gap-2 justify-end mb-3">
                              <Sparkles className="h-4 w-4 text-amber-500 shrink-0" />
                              <h3 className="text-sm font-black text-emerald-950 truncate text-right">
                                צעד {step.step_number}: {step.title}
                              </h3>
                            </div>
                            <div className="relative space-y-2">
                              <p className="text-[11px] font-bold text-emerald-800/85 text-right">משימות שקיבלת</p>
                                {acceptedTasks.map((t) => {
                                  const { schedule, times_per_day, weekly_day, meal_timing, meal_target } =
                                    resolveTaskSchedule(t, userMealProfile);
                                  const isRecurring = schedule !== 'one_time';
                                  const done = prog?.task_statuses?.[t.id]?.execution_done === true;
                                  const busy = saving === t.id;
                                  const emoji = emojiFromWellnessText(t.title, '✅');

                                  if (isRecurring) {
                                    const taskExecs = stepExecutions.filter((e) => e.task_id === t.id);
                                    return (
                                      <div
                                        key={t.id}
                                        dir="rtl"
                                        className="glass-inset relative overflow-hidden rounded-2xl px-3 py-2.5 space-y-2"
                                      >
                                        <div className="flex items-center gap-2 justify-end">
                                          <span className="glass-pill relative overflow-hidden text-[10px] font-bold tracking-wide px-2.5 py-1 rounded-full text-emerald-900">
                                            {scheduleLabel(
                                              schedule,
                                              times_per_day,
                                              weekly_day,
                                              meal_timing,
                                              meal_target
                                            )}
                                          </span>
                                          <span className="text-xl shrink-0" aria-hidden>
                                            {emoji}
                                          </span>
                                          <span className="flex-1 text-right text-sm font-bold text-emerald-950 leading-snug">
                                            {t.title}
                                          </span>
                                        </div>
                                        <TaskDailySlots
                                          task={t}
                                          stepId={step.id}
                                          todayExecutions={taskExecs}
                                          userMealProfile={userMealProfile}
                                          onExecutionsChanged={() => void load()}
                                        />
                                      </div>
                                    );
                                  }

                                  return (
                                    <label
                                      key={t.id}
                                      dir="rtl"
                                      className="glass-inset flex items-center gap-3 rounded-2xl px-3 py-2.5 cursor-pointer transition active:scale-[0.99]"
                                    >
                                      <input
                                        type="checkbox"
                                        className="h-5 w-5 accent-emerald-600 shrink-0"
                                        checked={done}
                                        disabled={busy}
                                        onChange={(e) =>
                                          void saveTaskExecution(step.id, t.id, e.target.checked, prog ?? null)
                                        }
                                      />
                                      <span className="text-xl shrink-0" aria-hidden>
                                        {emoji}
                                      </span>
                                      <span className="flex-1 text-right text-sm font-bold text-emerald-950 leading-snug">
                                        {t.title}
                                      </span>
                                    </label>
                                  );
                                })}
                            </div>
                          </div>
                        );
                      })}
                      {data.steps.every((s) => {
                        const tasks = parseItems(s.tasks);
                        const accepted = tasks.filter((t) => s.progress?.task_statuses?.[t.id]?.status === 'accepted');
                        return accepted.length === 0;
                      }) && (
                        <p className="text-center text-sm text-emerald-900/70 py-12 px-4 leading-relaxed">
                          אין משימות שסימנתם כמקובלות. בסיכום השיעור לחצו &quot;מקובל עליי&quot; — ואז תוכלו לדווח כאן על ביצוע.
                        </p>
                      )}
                    </>
                  )}

                  {activeTab === 'habits' && (
                    <>
                      {data.steps.map((step) => {
                        const habits = parseHabitItems(step.habits);
                        const tasks = parseTaskItems(step.tasks);
                        const prog = step.progress;
                        const stepExecs = [
                          ...(data.recent_executions ?? []),
                          ...(data.today_executions ?? []),
                        ].filter((e) => e.step_id === step.id);
                        if (habits.length === 0) return null;
                        return (
                          <div
                            key={step.id}
                            dir="rtl"
                            className="glass-surface relative overflow-hidden rounded-[22px] px-3 py-3"
                          >
                            <span
                              aria-hidden
                              className="pointer-events-none absolute inset-x-4 top-px h-px"
                              style={{
                                background:
                                  'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)',
                              }}
                            />
                            <div className="relative flex items-center gap-2 justify-end mb-3">
                              <Leaf className="h-4 w-4 text-emerald-600 shrink-0" />
                              <h3 className="text-sm font-black text-emerald-950 truncate text-right">
                                צעד {step.step_number}: {step.title}
                              </h3>
                            </div>
                            <div className="relative space-y-2">
                                <p className="text-[11px] font-bold text-emerald-800/85 text-right flex items-center justify-end gap-1">
                                  <Leaf className="h-3.5 w-3.5" />
                                  הרגלים בצעד
                                </p>
                                {habits.map((h) => {
                                  const emoji = emojiFromWellnessText(h.title, '🌿');
                                  /**
                                   * חלון היסטוריה דינמי: עד פי 2 מה-target_days,
                                   * אבל לפחות 28 ימים (חודש) ולא יותר מ-180 (חצי שנה).
                                   * כך הרגל של 90 ימים יראה את כל ההתקדמות עד היום.
                                   */
                                  const targetDaysHint =
                                    typeof h.target_days === 'number' && h.target_days >= 3
                                      ? h.target_days
                                      : 21;
                                  const historyDays = Math.max(
                                    28,
                                    Math.min(180, Math.round(targetDaysHint * 2))
                                  );
                                  const snapshot = computeHabitProgressSnapshot({
                                    habit: h,
                                    stepTasks: tasks,
                                    taskStatuses: (prog?.task_statuses ?? {}) as Record<
                                      string,
                                      { status: TaskStatus; execution_done?: boolean }
                                    >,
                                    executions: stepExecs,
                                    habitMeta: prog?.habit_meta,
                                    todayKey: data.today_date_key,
                                    historyDays,
                                  });
                                  return (
                                    <HabitProgressCard
                                      key={h.id}
                                      title={h.title}
                                      emoji={emoji}
                                      snapshot={snapshot}
                                    />
                                  );
                                })}
                                {parseJourneyTasksFull(step.tasks)
                                  .filter((t) => t.leveling?.levels?.length)
                                  .map((t) => {
                                    const statuses = (prog?.task_statuses ?? {}) as Record<
                                      string,
                                      { status: TaskStatus }
                                    >;
                                    if (statuses[t.id]?.status !== 'accepted') return null;
                                    const snapshot = computeTaskLevelProgressSnapshot({
                                      task: t,
                                      executions: stepExecs,
                                      taskLevelMeta: prog?.task_level_meta,
                                      todayKey: data.today_date_key,
                                    });
                                    return (
                                      <TaskLevelProgressCard
                                        key={`level-${t.id}`}
                                        taskTitle={t.title}
                                        emoji={t.emoji || '✅'}
                                        stepId={step.id}
                                        snapshot={snapshot}
                                        levels={t.leveling?.levels}
                                      />
                                    );
                                  })}
                            </div>
                          </div>
                        );
                      })}
                      {data.steps.every((s) => parseItems(s.habits).length === 0) && (
                        <p className="text-center text-sm text-emerald-900/70 py-12 px-4 leading-relaxed">
                          אין הרגלים מוגדרים בצעדי המסע כרגע.
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </ProgressReportContext.Provider>
  );
}
