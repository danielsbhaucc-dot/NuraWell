'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { Drawer } from 'vaul';
import { ClipboardCheck, Leaf, Loader2, Sparkles } from 'lucide-react';
import { emojiFromWellnessText } from '../../lib/emoji-from-text';
import { parseJourneyReportItems } from '../../lib/journey/journey-report-parse';

type TaskStatus = 'accepted' | 'rejected' | 'pending';

type ReportProgress = {
  task_statuses?: Record<string, { status: TaskStatus; decided_at?: string | null; execution_done?: boolean }>;
  habits_progress?: Record<string, boolean[]>;
};

type ReportStep = {
  id: string;
  title: string;
  step_number: number;
  tasks: unknown;
  habits: unknown;
  progress: ReportProgress | null;
};

type JourneyReportResponse = { steps: ReportStep[] };

/** כרטיסיית ראשית במגירת הדיווח — עדכון ביצוע משימות; השנייה — הרגלים */
export type ProgressReportTabId = 'task_execution' | 'habits';

const parseItems = parseJourneyReportItems;

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

export function ProgressReportProvider({ userId: _userId, children }: { userId: string; children: ReactNode }) {
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
        if (res.ok && done) {
          void fetch('/api/v1/almog-task-celebration', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ step_id: stepId, task_id: taskId }),
          }).catch(() => {});
        }
        await load();
      } finally {
        setSaving(null);
      }
    },
    [load]
  );

  const saveHabitToggle = useCallback(
    async (stepId: string, habitId: string, done: boolean, progress: ReportProgress | null) => {
      const next = { ...(progress?.habits_progress ?? {}) };
      next[habitId] = done ? [true] : [];
      setSaving(habitId);
      try {
        await fetch('/api/v1/journey-progress', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            step_id: stepId,
            habits_progress: next,
          }),
        });
        await load();
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
                className="flex gap-1 rounded-[22px] p-1"
                role="tablist"
                aria-label="סוג דיווח"
                style={{
                  background: 'rgba(255,255,255,0.42)',
                  backdropFilter: 'blur(18px)',
                  WebkitBackdropFilter: 'blur(18px)',
                  border: '1px solid rgba(255,255,255,0.55)',
                  boxShadow:
                    'inset 0 1px 0 rgba(255,255,255,0.65), 0 6px 20px rgba(6,78,59,0.08)',
                }}
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
                        const tasks = parseItems(step.tasks);
                        const prog = step.progress;
                        const acceptedTasks = tasks.filter((t) => prog?.task_statuses?.[t.id]?.status === 'accepted');
                        if (acceptedTasks.length === 0) return null;
                        return (
                          <div
                            key={step.id}
                            className="rounded-[22px] p-[1px]"
                            style={{
                              background:
                                'linear-gradient(145deg, rgba(52,211,153,0.45), rgba(167,243,208,0.25), rgba(255,255,255,0.65))',
                            }}
                          >
                            <div
                              className="rounded-[21px] px-3 py-3"
                              style={{
                                background: 'rgba(255,255,255,0.55)',
                                border: '1px solid rgba(255,255,255,0.65)',
                                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.8)',
                              }}
                            >
                              <div className="flex items-center gap-2 justify-end mb-3">
                                <Sparkles className="h-4 w-4 text-amber-500 shrink-0" />
                                <h3 className="text-sm font-black text-[#1A1730] truncate">
                                  צעד {step.step_number}: {step.title}
                                </h3>
                              </div>
                              <div className="space-y-2">
                                <p className="text-[11px] font-bold text-emerald-800/80 text-right">משימות שקיבלת</p>
                                {acceptedTasks.map((t) => {
                                  const done = prog?.task_statuses?.[t.id]?.execution_done === true;
                                  const busy = saving === t.id;
                                  const emoji = emojiFromWellnessText(t.title, '✅');
                                  return (
                                    <label
                                      key={t.id}
                                      className="flex items-center gap-3 rounded-2xl px-3 py-2.5 cursor-pointer transition active:scale-[0.99]"
                                      style={{
                                        background: 'rgba(255,255,255,0.72)',
                                        border: '1px solid rgba(16,185,129,0.22)',
                                      }}
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
                                      <span className="flex-1 text-right text-sm font-bold text-[#1A1730] leading-snug">
                                        {t.title}
                                      </span>
                                    </label>
                                  );
                                })}
                              </div>
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
                        const habits = parseItems(step.habits);
                        const prog = step.progress;
                        if (habits.length === 0) return null;
                        return (
                          <div
                            key={step.id}
                            className="rounded-[22px] p-[1px]"
                            style={{
                              background:
                                'linear-gradient(145deg, rgba(52,211,153,0.45), rgba(167,243,208,0.25), rgba(255,255,255,0.65))',
                            }}
                          >
                            <div
                              className="rounded-[21px] px-3 py-3"
                              style={{
                                background: 'rgba(255,255,255,0.55)',
                                border: '1px solid rgba(255,255,255,0.65)',
                                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.8)',
                              }}
                            >
                              <div className="flex items-center gap-2 justify-end mb-3">
                                <Leaf className="h-4 w-4 text-emerald-600 shrink-0" />
                                <h3 className="text-sm font-black text-[#1A1730] truncate">
                                  צעד {step.step_number}: {step.title}
                                </h3>
                              </div>
                              <div className="space-y-2">
                                <p className="text-[11px] font-bold text-emerald-800/80 text-right flex items-center justify-end gap-1">
                                  <Leaf className="h-3.5 w-3.5" />
                                  הרגלים בצעד
                                </p>
                                {habits.map((h) => {
                                  const arr = prog?.habits_progress?.[h.id];
                                  const done = Array.isArray(arr) && arr.some(Boolean);
                                  const busy = saving === h.id;
                                  const emoji = emojiFromWellnessText(h.title, '🌿');
                                  return (
                                    <label
                                      key={h.id}
                                      className="flex items-center gap-3 rounded-2xl px-3 py-2.5 cursor-pointer transition active:scale-[0.99]"
                                      style={{
                                        background: 'rgba(236,253,245,0.65)',
                                        border: '1px solid rgba(16,185,129,0.2)',
                                      }}
                                    >
                                      <input
                                        type="checkbox"
                                        className="h-5 w-5 accent-emerald-600 shrink-0"
                                        checked={done}
                                        disabled={busy}
                                        onChange={(e) =>
                                          void saveHabitToggle(step.id, h.id, e.target.checked, prog ?? null)
                                        }
                                      />
                                      <span className="text-xl shrink-0" aria-hidden>
                                        {emoji}
                                      </span>
                                      <span className="flex-1 text-right text-sm font-bold text-[#1A1730] leading-snug">
                                        {h.title}
                                      </span>
                                    </label>
                                  );
                                })}
                              </div>
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
