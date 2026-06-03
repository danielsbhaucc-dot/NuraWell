'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, Loader2, RotateCcw, XCircle } from 'lucide-react';

import type { JourneyTask, JourneyTaskExecution, JourneyTaskSlot } from '../../lib/types/journey';
import {
  jerusalemDateKey,
  resolveTaskSchedule,
  slotEmoji,
  slotLabel,
  slotsForSchedule,
  isTaskActiveToday,
  scheduleLabel,
  type UserMealProfile,
} from '../../lib/journey/task-schedule';

interface TaskDailySlotsProps {
  task: JourneyTask;
  stepId: string;
  /** ביצועי היום עבור המשתמש בטבלת journey_task_executions (אם הוזרק מבחוץ) */
  todayExecutions?: ReadonlyArray<
    Pick<JourneyTaskExecution, 'task_id' | 'slot' | 'date_key' | 'completed_at'> & {
      outcome?: 'completed' | 'attempt_failed' | string | null;
    }
  >;
  /** קולבק בעקבות עדכון מקומי — מאפשר לרענן רשימה שמוזרקת מבחוץ */
  onExecutionsChanged?: () => void;
  /** פרופיל ארוחות של המשתמש — נדרש כש-task.meal_target === 'all' */
  userMealProfile?: UserMealProfile | null;
}

/**
 * מצב סלוט יומי:
 *  - `completed` — נסגר בהצלחה.
 *  - `attemptFailed` — המשתמש דיווח "ניסיתי ונכשלתי" (סלוט כן נשמר ב-DB
 *    עם `outcome=attempt_failed`, אבל לא נחשב לרצף ולא מעלה את ה-counter).
 *  שני המצבים *אינם מתבטלים זה את זה* בו-זמנית — היררכיה: completed עוצר failed.
 */
type SlotState = Map<
  string,
  {
    completed: boolean;
    attemptFailed: boolean;
    busy: boolean;
    completedAt: string | null;
  }
>;

const slotKey = (taskId: string, dateKey: string, slot: JourneyTaskSlot) =>
  `${taskId}::${dateKey}::${slot}`;

export function TaskDailySlots({
  task,
  stepId,
  todayExecutions,
  onExecutionsChanged,
  userMealProfile,
}: TaskDailySlotsProps) {
  const { schedule, times_per_day, weekly_day, meal_timing, meal_target } = resolveTaskSchedule(
    task,
    userMealProfile ?? null
  );
  const slots = useMemo(() => slotsForSchedule(schedule, times_per_day), [schedule, times_per_day]);
  const activeToday = useMemo(() => isTaskActiveToday(task), [task]);
  /**
   * מתעדכן באוטומטיות בחצות (Asia/Jerusalem) באמצעות timer חוץ-חיצוני שמופעל
   * אחת ל-דקה ובודק אם dateKey השתנה. כך משימה שנותרה פתוחה בטאב לא תכלול
   * את הסימונים של היום הקודם.
   */
  const [dateKey, setDateKey] = useState<string>(() => jerusalemDateKey());
  useEffect(() => {
    const id = setInterval(() => {
      const next = jerusalemDateKey();
      setDateKey((prev) => (prev === next ? prev : next));
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  const [state, setState] = useState<SlotState>(() => {
    const m: SlotState = new Map();
    for (const s of slots) {
      m.set(slotKey(task.id, dateKey, s), {
        completed: false,
        attemptFailed: false,
        busy: false,
        completedAt: null,
      });
    }
    return m;
  });
  const [errMsg, setErrMsg] = useState<string | null>(null);

  /** סנכרון state מנתונים שמוזרקים מבחוץ */
  useEffect(() => {
    if (!todayExecutions) return;
    setState((prev) => {
      const next: SlotState = new Map(prev);
      for (const s of slots) {
        const k = slotKey(task.id, dateKey, s);
        if (!next.has(k)) {
          next.set(k, { completed: false, attemptFailed: false, busy: false, completedAt: null });
        }
      }
      for (const e of todayExecutions) {
        if (e.task_id !== task.id || e.date_key !== dateKey) continue;
        const k = slotKey(task.id, dateKey, e.slot as JourneyTaskSlot);
        const existing = next.get(k);
        if (!existing) continue;
        const isFail = e.outcome === 'attempt_failed';
        next.set(k, {
          ...existing,
          completed: !isFail,
          attemptFailed: isFail,
          completedAt: e.completed_at,
        });
      }
      return next;
    });
  }, [todayExecutions, slots, task.id, dateKey]);

  /** טעינה מקומית כשלא הוזרקה רשימה מבחוץ */
  useEffect(() => {
    if (todayExecutions) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/v1/task-executions?step_id=${encodeURIComponent(stepId)}&task_id=${encodeURIComponent(task.id)}&days=2`,
          { credentials: 'include', cache: 'no-store' }
        );
        if (!res.ok || cancelled) return;
        const json = (await res.json()) as {
          executions: Array<JourneyTaskExecution & { outcome?: string | null }>;
        };
        if (cancelled) return;
        setState((prev) => {
          const next: SlotState = new Map(prev);
          for (const e of json.executions ?? []) {
            if (e.task_id !== task.id || e.date_key !== dateKey) continue;
            const k = slotKey(task.id, dateKey, e.slot as JourneyTaskSlot);
            const existing = next.get(k) ?? {
              completed: false,
              attemptFailed: false,
              busy: false,
              completedAt: null,
            };
            const isFail = e.outcome === 'attempt_failed';
            next.set(k, {
              ...existing,
              completed: !isFail,
              attemptFailed: isFail,
              completedAt: e.completed_at,
            });
          }
          return next;
        });
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [todayExecutions, stepId, task.id, dateKey]);

  /**
   * Toggle סלוט "בוצע":
   *  - אם הסלוט כבר נסגר → DELETE (ביטול).
   *  - אחרת → POST עם `outcome=completed`. מפעיל פרגון *פר-סלוט* (לא רק
   *    כשהכל הושלם), כי כל סימון הוא רגע ניצחון בפני עצמו.
   *  - אם היה דווח "ניסיתי ונכשלתי" קודם — מבטל אותו (DELETE) ואז POST.
   */
  const toggleSlot = useCallback(
    async (slot: JourneyTaskSlot, currentlyCompleted: boolean) => {
      const key = slotKey(task.id, dateKey, slot);
      setState((prev) => {
        const next = new Map(prev);
        const existing = next.get(key) ?? {
          completed: false,
          attemptFailed: false,
          busy: true,
          completedAt: null,
        };
        next.set(key, { ...existing, busy: true });
        return next;
      });

      try {
        /** אם זה ביטול → DELETE ויציאה. */
        if (currentlyCompleted) {
          const delRes = await fetch('/api/v1/task-executions', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              step_id: stepId,
              task_id: task.id,
              slot,
              date_key: dateKey,
            }),
          });
          if (delRes.ok) {
            setErrMsg(null);
            setState((prev) => {
              const next = new Map(prev);
              next.set(key, {
                completed: false,
                attemptFailed: false,
                busy: false,
                completedAt: null,
              });
              return next;
            });
            onExecutionsChanged?.();
            return;
          }
        }

        /** אחרת — POST סימון "בוצע" */
        const res = await fetch('/api/v1/task-executions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            step_id: stepId,
            task_id: task.id,
            slot,
            date_key: dateKey,
            source: 'manual',
            outcome: 'completed',
          }),
        });

        if (res.ok) {
          setErrMsg(null);
          setState((prev) => {
            const next = new Map(prev);
            next.set(key, {
              completed: true,
              attemptFailed: false,
              busy: false,
              completedAt: new Date().toISOString(),
            });
            return next;
          });
          onExecutionsChanged?.();
          /**
           * 🎉 חגיגה *פר-סלוט* — כל סימון מקבל פרגון. ה-LLM ידע ממה לחגוג
           * (סלוט/סטריק/יום שלם) דרך השדות שמועברים פה. אין race עם
           * fire-and-forget — אם המשתמש סוגר את הטאב, חגיגה תיכנס ל-DB
           * ותגיע ב-realtime/SW לפעם הבאה.
           */
          void fetch('/api/v1/almog-task-celebration', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              step_id: stepId,
              task_id: task.id,
              slot,
              outcome: 'completed',
            }),
          }).catch(() => {});
        } else {
          let serverMsg = `שגיאה בשמירה (HTTP ${res.status})`;
          try {
            const body = (await res.json()) as {
              error?: string;
              code?: string;
              hint?: string;
            };
            const hint = body.hint ? ` · ${body.hint}` : '';
            if (body.code === '42P01') {
              serverMsg = 'הטבלה לא קיימת ב-DB. הריצו את המיגרציה 000023 ב-Supabase.';
            } else if (body.code === '42703') {
              serverMsg = 'הריצו את המיגרציה 000030 ב-Supabase (outcome column).';
            } else if (body.error) {
              serverMsg = `${body.error}${hint}`;
            }
          } catch {
            /* ignore JSON parse */
          }
          setErrMsg(serverMsg);
          setState((prev) => {
            const next = new Map(prev);
            const existing = next.get(key) ?? {
              completed: false,
              attemptFailed: false,
              busy: false,
              completedAt: null,
            };
            next.set(key, { ...existing, busy: false });
            return next;
          });
        }
      } catch (e) {
        setErrMsg(e instanceof Error ? e.message : 'שגיאת רשת');
        setState((prev) => {
          const next = new Map(prev);
          const existing = next.get(key) ?? {
            completed: false,
            attemptFailed: false,
            busy: false,
            completedAt: null,
          };
          next.set(key, { ...existing, busy: false });
          return next;
        });
      }
    },
    [stepId, task.id, dateKey, onExecutionsChanged]
  );

  /**
   * דיווח "ניסיתי ונכשלתי" — שומר ב-DB עם `outcome=attempt_failed`,
   * שולח מסר תמיכה (לא חגיגה), ומציג צבע סגול בהיסטוריה.
   * אם הסלוט כבר היה מסומן "בוצע" — לא מאפשרים (סוג של no-op).
   */
  const reportAttemptFailed = useCallback(
    async (slot: JourneyTaskSlot, currentlyAttemptFailed: boolean) => {
      const key = slotKey(task.id, dateKey, slot);
      setState((prev) => {
        const next = new Map(prev);
        const existing = next.get(key) ?? {
          completed: false,
          attemptFailed: false,
          busy: true,
          completedAt: null,
        };
        if (existing.completed) return prev;
        next.set(key, { ...existing, busy: true });
        return next;
      });

      try {
        /** טוגל — אם כבר מסומן ניסיון, מבטלים. */
        if (currentlyAttemptFailed) {
          const delRes = await fetch('/api/v1/task-executions', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              step_id: stepId,
              task_id: task.id,
              slot,
              date_key: dateKey,
            }),
          });
          if (delRes.ok) {
            setErrMsg(null);
            setState((prev) => {
              const next = new Map(prev);
              next.set(key, {
                completed: false,
                attemptFailed: false,
                busy: false,
                completedAt: null,
              });
              return next;
            });
            onExecutionsChanged?.();
            return;
          }
        }

        const res = await fetch('/api/v1/task-executions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            step_id: stepId,
            task_id: task.id,
            slot,
            date_key: dateKey,
            source: 'manual',
            outcome: 'attempt_failed',
          }),
        });

        if (res.ok) {
          setErrMsg(null);
          setState((prev) => {
            const next = new Map(prev);
            next.set(key, {
              completed: false,
              attemptFailed: true,
              busy: false,
              completedAt: new Date().toISOString(),
            });
            return next;
          });
          onExecutionsChanged?.();
          /** מסר תמיכה (לא חגיגה) מאלמוג */
          void fetch('/api/v1/almog-task-celebration', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              step_id: stepId,
              task_id: task.id,
              slot,
              outcome: 'attempt_failed',
            }),
          }).catch(() => {});
        } else {
          let serverMsg = `שגיאה בשמירה (HTTP ${res.status})`;
          try {
            const body = (await res.json()) as { error?: string; code?: string };
            if (body.code === '42703') {
              serverMsg = 'הריצו את המיגרציה 000030 ב-Supabase (outcome column).';
            } else if (body.error) {
              serverMsg = body.error;
            }
          } catch {
            /* ignore */
          }
          setErrMsg(serverMsg);
          setState((prev) => {
            const next = new Map(prev);
            const existing = next.get(key) ?? {
              completed: false,
              attemptFailed: false,
              busy: false,
              completedAt: null,
            };
            next.set(key, { ...existing, busy: false });
            return next;
          });
        }
      } catch (e) {
        setErrMsg(e instanceof Error ? e.message : 'שגיאת רשת');
        setState((prev) => {
          const next = new Map(prev);
          const existing = next.get(key) ?? {
            completed: false,
            attemptFailed: false,
            busy: false,
            completedAt: null,
          };
          next.set(key, { ...existing, busy: false });
          return next;
        });
      }
    },
    [stepId, task.id, dateKey, onExecutionsChanged]
  );

  const completedCount = useMemo(() => {
    let n = 0;
    for (const s of slots) {
      if (state.get(slotKey(task.id, dateKey, s))?.completed) n++;
    }
    return n;
  }, [state, slots, task.id, dateKey]);

  const total = slots.length;

  if (schedule === 'one_time') return null;

  if (schedule === 'weekly' && !activeToday) {
    return (
      <div
        dir="rtl"
        className="glass-inset mt-2 rounded-2xl px-3 py-3 text-[12px] font-semibold text-emerald-900/85 leading-relaxed text-right"
        style={{ borderStyle: 'dashed' }}
      >
        <RotateCcw className="inline w-3.5 h-3.5 ml-1 -mt-0.5 text-emerald-700" />
        משימה שבועית — מופיעה לסימון רק ביום שנקבע ({scheduleLabel(schedule, times_per_day, weekly_day, meal_timing, meal_target)}).
      </div>
    );
  }

  return (
    <div
      dir="rtl"
      className="glass-inset relative overflow-hidden mt-2 rounded-2xl px-3 py-3 space-y-2"
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-3 top-px h-px"
        style={{
          background:
            'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)',
        }}
      />
      <div className="relative flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-black text-emerald-900/85">
            סימון יומי
          </span>
          <span className="text-[11px] font-semibold text-emerald-800/70">
            {scheduleLabel(schedule, times_per_day, weekly_day, meal_timing, meal_target)}
          </span>
        </div>
        <span
          className={`text-[11px] font-black tabular-nums px-2.5 py-1 rounded-full ${
            completedCount === total ? '' : 'glass-pill'
          }`}
          style={
            completedCount === total
              ? {
                  background:
                    'linear-gradient(135deg, rgba(16,185,129,0.95), rgba(52,211,153,0.85))',
                  color: '#fff',
                  border: '1px solid rgba(52,211,153,0.50)',
                  boxShadow:
                    '0 2px 8px rgba(16,185,129,0.30), inset 0 1px 0 rgba(255,255,255,0.35)',
                }
              : { color: '#065f46' }
          }
        >
          {completedCount}/{total}
        </span>
      </div>

      <div
        className={`relative grid gap-2 ${total >= 3 ? 'grid-cols-3' : total === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}
      >
        {slots.map((slot) => {
          const key = slotKey(task.id, dateKey, slot);
          const cell = state.get(key) ?? {
            completed: false,
            attemptFailed: false,
            busy: false,
            completedAt: null,
          };
          /**
           * סגנון לפי מצב:
           *  - completed       → ירוק מלא + check
           *  - attemptFailed   → סגול-אפרסק עדין + X (לא דרמטי)
           *  - default         → glass pill פתוח
           */
          const isCompleted = cell.completed;
          const isFailed = !cell.completed && cell.attemptFailed;
          return (
            <div key={slot} className="flex flex-col gap-1">
              <button
                type="button"
                disabled={cell.busy}
                onClick={() => void toggleSlot(slot, cell.completed)}
                className={`relative flex flex-col items-center justify-center gap-1 rounded-2xl py-2.5 px-2 transition active:scale-[0.97] disabled:opacity-50 ${
                  isCompleted
                    ? 'text-white ring-1 ring-white/30'
                    : isFailed
                      ? 'text-violet-900 ring-1 ring-violet-300/50'
                      : 'glass-pill text-emerald-900'
                }`}
                style={
                  isCompleted
                    ? {
                        minHeight: 56,
                        background: 'linear-gradient(135deg, #047857 0%, #10b981 100%)',
                        border: '1px solid rgba(167,243,208,0.55)',
                        boxShadow:
                          '0 6px 16px rgba(6,78,59,0.25), inset 0 1px 0 rgba(255,255,255,0.30)',
                      }
                    : isFailed
                      ? {
                          minHeight: 56,
                          background:
                            'linear-gradient(135deg, rgba(196,181,253,0.55) 0%, rgba(216,180,254,0.45) 100%)',
                          border: '1px solid rgba(167,139,250,0.45)',
                          boxShadow:
                            '0 3px 10px rgba(109,40,217,0.10), inset 0 1px 0 rgba(255,255,255,0.40)',
                        }
                      : { minHeight: 56 }
                }
                aria-label={
                  isCompleted
                    ? `סלוט בוצע — לחץ לביטול`
                    : isFailed
                      ? `סימנת ניסיון שלא הסתדר — לחץ לסימון "בוצע"`
                      : `סמן בוצע: ${slotLabel(slot, schedule === 'per_meal' ? meal_timing : undefined)}`
                }
              >
                <span className="text-base leading-none" aria-hidden>
                  {slotEmoji(slot)}
                </span>
                <span className="text-[11px] font-black leading-tight">
                  {slotLabel(slot, schedule === 'per_meal' ? meal_timing : undefined)}
                </span>
                {isCompleted ? (
                  <Check className="absolute top-1 right-1 w-3.5 h-3.5 text-white/95" strokeWidth={3} />
                ) : isFailed ? (
                  <XCircle
                    className="absolute top-1 right-1 w-3.5 h-3.5 text-violet-700/85"
                    strokeWidth={2.5}
                  />
                ) : null}
                {cell.busy ? (
                  <Loader2 className="absolute top-1 right-1 w-3.5 h-3.5 animate-spin opacity-80" />
                ) : null}
              </button>
              {/**
               * כפתור "ניסיתי ונכשלתי" — מוצג רק אם הסלוט עוד לא הושלם
               * (אין טעם לדווח על כישלון לסלוט שכבר עבר בהצלחה).
               */}
              {!isCompleted ? (
                <button
                  type="button"
                  disabled={cell.busy}
                  onClick={() => void reportAttemptFailed(slot, isFailed)}
                  className={`relative text-[10px] font-bold py-1 px-2 rounded-xl transition active:scale-[0.97] disabled:opacity-50 ${
                    isFailed
                      ? 'bg-violet-100/85 text-violet-900 ring-1 ring-violet-300/60'
                      : 'bg-slate-100/60 text-slate-700 hover:bg-violet-50/75 hover:text-violet-800'
                  }`}
                  aria-label={
                    isFailed
                      ? 'בטל דיווח על ניסיון שלא הסתדר'
                      : 'דווח שניסיתי ולא הסתדר'
                  }
                >
                  {isFailed ? 'דווח על ניסיון · בטל' : 'ניסיתי ונכשלתי'}
                </button>
              ) : null}
            </div>
          );
        })}
      </div>

      <p className="text-[10px] text-emerald-900/65 leading-relaxed text-right">
        {schedule === 'daily' || schedule === 'weekly'
          ? 'הסימון מתאפס מחר — אפשר לחזור ולסמן שוב. אפשר גם לדווח "ניסיתי" כדי שאלמוג ידע שניסית.'
          : 'כל סלוט מתאפס מחר. דווח "בוצע" או "ניסיתי" — אלמוג רואה הכל בזמן אמת.'}
      </p>

      {errMsg ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl px-3 py-2 text-[11px] font-semibold leading-relaxed text-amber-900"
          style={{ background: 'rgba(254, 243, 199, 0.85)', border: '1px solid rgba(217,119,6,0.45)' }}
        >
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-700" aria-hidden />
          <span className="break-words">{errMsg}</span>
        </div>
      ) : null}
    </div>
  );
}
