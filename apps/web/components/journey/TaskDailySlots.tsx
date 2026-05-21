'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, Loader2, RotateCcw } from 'lucide-react';

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
  todayExecutions?: ReadonlyArray<Pick<JourneyTaskExecution, 'task_id' | 'slot' | 'date_key' | 'completed_at'>>;
  /** קולבק בעקבות עדכון מקומי — מאפשר לרענן רשימה שמוזרקת מבחוץ */
  onExecutionsChanged?: () => void;
  /** פרופיל ארוחות של המשתמש — נדרש כש-task.meal_target === 'all' */
  userMealProfile?: UserMealProfile | null;
}

type SlotState = Map<string, { completed: boolean; busy: boolean; completedAt: string | null }>;

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
      m.set(slotKey(task.id, dateKey, s), { completed: false, busy: false, completedAt: null });
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
        if (!next.has(k)) next.set(k, { completed: false, busy: false, completedAt: null });
      }
      for (const e of todayExecutions) {
        if (e.task_id !== task.id || e.date_key !== dateKey) continue;
        const k = slotKey(task.id, dateKey, e.slot as JourneyTaskSlot);
        const existing = next.get(k);
        if (existing) {
          next.set(k, { ...existing, completed: true, completedAt: e.completed_at });
        }
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
        const json = (await res.json()) as { executions: JourneyTaskExecution[] };
        if (cancelled) return;
        setState((prev) => {
          const next: SlotState = new Map(prev);
          for (const e of json.executions ?? []) {
            if (e.task_id !== task.id || e.date_key !== dateKey) continue;
            const k = slotKey(task.id, dateKey, e.slot as JourneyTaskSlot);
            const existing = next.get(k) ?? { completed: false, busy: false, completedAt: null };
            next.set(k, { ...existing, completed: true, completedAt: e.completed_at });
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

  const toggleSlot = useCallback(
    async (slot: JourneyTaskSlot, currentlyCompleted: boolean) => {
      const key = slotKey(task.id, dateKey, slot);
      setState((prev) => {
        const next = new Map(prev);
        const existing = next.get(key) ?? { completed: false, busy: true, completedAt: null };
        next.set(key, { ...existing, busy: true });
        return next;
      });

      try {
        const method = currentlyCompleted ? 'DELETE' : 'POST';
        const res = await fetch('/api/v1/task-executions', {
          method,
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            step_id: stepId,
            task_id: task.id,
            slot,
            date_key: dateKey,
            ...(method === 'POST' ? { source: 'manual' } : {}),
          }),
        });

        if (res.ok) {
          setErrMsg(null);
          setState((prev) => {
            const next = new Map(prev);
            next.set(key, {
              completed: !currentlyCompleted,
              busy: false,
              completedAt: !currentlyCompleted ? new Date().toISOString() : null,
            });
            return next;
          });
          onExecutionsChanged?.();
          if (!currentlyCompleted) {
            const newCompleted = completedCount + 1;
            if (newCompleted >= total && total > 0) {
              void fetch('/api/v1/almog-task-celebration', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ step_id: stepId, task_id: task.id }),
              }).catch(() => {});
            }
          }
        } else {
          /** מציג את הסיבה האמיתית — חשוב אם הטבלה חסרה ב-DB / RLS חוסם. */
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
            } else if (body.error) {
              serverMsg = `${body.error}${hint}`;
            }
          } catch {
            /* ignore JSON parse */
          }
          setErrMsg(serverMsg);
          setState((prev) => {
            const next = new Map(prev);
            const existing = next.get(key) ?? { completed: false, busy: false, completedAt: null };
            next.set(key, { ...existing, busy: false });
            return next;
          });
        }
      } catch (e) {
        setErrMsg(e instanceof Error ? e.message : 'שגיאת רשת');
        setState((prev) => {
          const next = new Map(prev);
          const existing = next.get(key) ?? { completed: false, busy: false, completedAt: null };
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
        className="mt-2 rounded-2xl px-3 py-3 text-[12px] font-semibold text-emerald-900/80 leading-relaxed"
        style={{
          background: 'rgba(255,255,255,0.5)',
          border: '1px dashed rgba(16,185,129,0.35)',
          backdropFilter: 'blur(6px)',
        }}
      >
        <RotateCcw className="inline w-3.5 h-3.5 ml-1 -mt-0.5 text-emerald-700" />
        משימה שבועית — מופיעה לסימון רק ביום שנקבע ({scheduleLabel(schedule, times_per_day, weekly_day, meal_timing, meal_target)}).
      </div>
    );
  }

  return (
    <div
      className="mt-2 rounded-2xl px-3 py-3 space-y-2"
      style={{
        background: 'linear-gradient(180deg, rgba(255,255,255,0.7) 0%, rgba(236,253,245,0.5) 100%)',
        border: '1px solid rgba(16,185,129,0.22)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.85)',
      }}
    >
      <div className="flex items-center justify-between flex-row-reverse">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-black text-emerald-900/85">
            סימון יומי
          </span>
          <span className="text-[11px] font-semibold text-emerald-800/70">
            {scheduleLabel(schedule, times_per_day, weekly_day, meal_timing, meal_target)}
          </span>
        </div>
        <span
          className="text-[11px] font-black tabular-nums px-2 py-0.5 rounded-full"
          style={{
            background:
              completedCount === total
                ? 'linear-gradient(135deg, rgba(16,185,129,0.95), rgba(52,211,153,0.85))'
                : 'rgba(255,255,255,0.7)',
            color: completedCount === total ? '#fff' : '#065f46',
            border: '1px solid rgba(16,185,129,0.4)',
          }}
        >
          {completedCount}/{total}
        </span>
      </div>

      <div
        className={`grid gap-2 ${total >= 3 ? 'grid-cols-3' : total === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}
      >
        {slots.map((slot) => {
          const key = slotKey(task.id, dateKey, slot);
          const cell = state.get(key) ?? { completed: false, busy: false, completedAt: null };
          return (
            <button
              key={slot}
              type="button"
              disabled={cell.busy}
              onClick={() => void toggleSlot(slot, cell.completed)}
              className={`relative flex flex-col items-center justify-center gap-1 rounded-2xl py-2.5 px-2 transition active:scale-[0.97] disabled:opacity-50 ${
                cell.completed
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-900/20 ring-1 ring-white/25'
                  : 'border border-emerald-400/40 bg-white/70 text-emerald-900 hover:bg-emerald-50/85'
              }`}
              style={{ backdropFilter: 'blur(8px)', minHeight: 56 }}
            >
              <span className="text-base leading-none" aria-hidden>
                {slotEmoji(slot)}
              </span>
              <span className="text-[11px] font-black leading-tight">
                {slotLabel(slot, schedule === 'per_meal' ? meal_timing : undefined)}
              </span>
              {cell.completed ? (
                <Check
                  className="absolute top-1 right-1 w-3.5 h-3.5 text-white/95"
                  strokeWidth={3}
                />
              ) : null}
              {cell.busy ? (
                <Loader2 className="absolute top-1 right-1 w-3.5 h-3.5 animate-spin opacity-80" />
              ) : null}
            </button>
          );
        })}
      </div>

      <p className="text-[10px] text-emerald-900/65 leading-relaxed text-right">
        {schedule === 'daily' || schedule === 'weekly'
          ? 'הסימון מתאפס מחר — אפשר לחזור ולסמן שוב.'
          : 'הסימון לכל סלוט מתאפס מחר בבוקר. אלמוג רואה את ההתקדמות בזמן אמת.'}
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
