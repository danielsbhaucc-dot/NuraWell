'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, History, Loader2, Sparkles, CalendarDays } from 'lucide-react';

import type { JourneyTaskExecution, JourneyTaskSlot } from '../../lib/types/journey';
import { slotEmoji, slotLabel } from '../../lib/journey/task-schedule';
import { emojiFromWellnessText } from '../../lib/emoji-from-text';

type StepShape = {
  id: string;
  title: string;
  step_number: number;
  tasks: unknown;
};

type TaskMeta = {
  taskId: string;
  taskTitle: string;
  taskEmoji: string;
  stepId: string;
  stepTitle: string;
  stepNumber: number;
};

type GroupedDay = {
  dateKey: string;
  dateLabel: string;
  weekday: string;
  total: number;
  items: Array<{
    execution: JourneyTaskExecution;
    meta: TaskMeta | null;
  }>;
};

const HEBREW_WEEKDAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

function formatHebrewDate(dateKey: string): { label: string; weekday: string } {
  /** dateKey הוא YYYY-MM-DD לפי לוח ירושלים; ניתן לפענח כתאריך מקומי */
  const [y, m, d] = dateKey.split('-').map((n) => Number.parseInt(n, 10));
  if (!y || !m || !d) return { label: dateKey, weekday: '' };
  const date = new Date(Date.UTC(y, m - 1, d));
  const wdShort = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jerusalem',
    weekday: 'short',
  }).format(date);
  const wdMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const wd = wdMap[wdShort] ?? 0;
  const label = `${d}.${m}.${y}`;
  return { label, weekday: HEBREW_WEEKDAYS[wd] ?? '' };
}

export function TaskHistoryPageClient() {
  const [executions, setExecutions] = useState<JourneyTaskExecution[]>([]);
  const [steps, setSteps] = useState<StepShape[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [execRes, repRes] = await Promise.all([
        fetch('/api/v1/task-executions?days=60', { cache: 'no-store', credentials: 'include' }),
        fetch('/api/v1/journey-report', { cache: 'no-store', credentials: 'include' }),
      ]);
      if (!execRes.ok) throw new Error('שגיאה בטעינת היסטוריה');
      const execJson = (await execRes.json()) as { executions: JourneyTaskExecution[] };
      setExecutions(execJson.executions ?? []);
      if (repRes.ok) {
        const repJson = (await repRes.json()) as { steps: StepShape[] };
        setSteps(repJson.steps ?? []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const taskMetaMap = useMemo(() => {
    const m = new Map<string, TaskMeta>();
    for (const step of steps) {
      const arr = Array.isArray(step.tasks) ? (step.tasks as unknown[]) : [];
      for (const raw of arr) {
        if (!raw || typeof raw !== 'object') continue;
        const row = raw as Record<string, unknown>;
        const taskId = typeof row.id === 'string' ? row.id : '';
        const taskTitle = typeof row.title === 'string' ? row.title : '';
        if (!taskId || !taskTitle) continue;
        const emoji = typeof row.emoji === 'string' ? row.emoji : '✅';
        m.set(`${step.id}::${taskId}`, {
          taskId,
          taskTitle,
          taskEmoji: emojiFromWellnessText(taskTitle, emoji),
          stepId: step.id,
          stepTitle: step.title,
          stepNumber: step.step_number,
        });
      }
    }
    return m;
  }, [steps]);

  const groups = useMemo<GroupedDay[]>(() => {
    const buckets = new Map<string, GroupedDay>();
    for (const e of executions) {
      if (!buckets.has(e.date_key)) {
        const fd = formatHebrewDate(e.date_key);
        buckets.set(e.date_key, {
          dateKey: e.date_key,
          dateLabel: fd.label,
          weekday: fd.weekday,
          total: 0,
          items: [],
        });
      }
      const bucket = buckets.get(e.date_key)!;
      bucket.items.push({
        execution: e,
        meta: taskMetaMap.get(`${e.step_id}::${e.task_id}`) ?? null,
      });
      bucket.total += 1;
    }
    return [...buckets.values()].sort((a, b) => (a.dateKey < b.dateKey ? 1 : -1));
  }, [executions, taskMetaMap]);

  /** סיכומים לתצוגה עליונה */
  const summary = useMemo(() => {
    const last7 = new Map<string, number>();
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const perTask = new Map<string, { meta: TaskMeta | null; count: number }>();
    let total = 0;
    for (const e of executions) {
      total += 1;
      if (e.date_key >= cutoff) {
        last7.set(e.date_key, (last7.get(e.date_key) ?? 0) + 1);
      }
      const key = `${e.step_id}::${e.task_id}`;
      const cur = perTask.get(key) ?? { meta: taskMetaMap.get(key) ?? null, count: 0 };
      cur.count += 1;
      perTask.set(key, cur);
    }
    const top = [...perTask.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 5)
      .map(([, v]) => v);
    return { total, daysActive: last7.size, top };
  }, [executions, taskMetaMap]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-emerald-800">
        <Loader2 className="h-9 w-9 animate-spin" />
        <p className="mt-3 text-sm font-semibold text-emerald-900/75">טוען היסטוריה…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-lg mx-auto px-4 py-8 text-center">
        <p className="text-sm text-red-700 font-semibold">{error}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-4 text-sm font-bold text-emerald-700 underline"
        >
          נסו שוב
        </button>
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="max-w-lg mx-auto px-4 py-10 text-center space-y-4">
        <div
          className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl"
          style={{
            background: 'linear-gradient(145deg, rgba(236,253,245,0.9), rgba(167,243,208,0.45))',
            border: '1px solid rgba(16,185,129,0.25)',
          }}
        >
          <History className="h-8 w-8 text-emerald-700" strokeWidth={2} />
        </div>
        <p className="text-[15px] font-black text-[#1A1730]">אין עדיין היסטוריה לסמן</p>
        <p className="text-sm text-gray-600 leading-relaxed">
          ברגע שתסמנו ביצוע של משימה יומית/חוזרת — היא תופיע כאן עם תאריך ושעה.
        </p>
        <Link
          href="/journey"
          className="inline-flex items-center gap-2 rounded-2xl px-5 py-3 font-bold text-white text-sm"
          style={{
            background: 'linear-gradient(135deg, #047857, #10b981)',
            boxShadow: '0 6px 20px rgba(16,185,129,0.28)',
          }}
        >
          <span>למסע שלי</span>
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto w-full min-w-0 px-4 py-4 space-y-5 pb-8">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-2.5">
        <div
          className="rounded-2xl p-3 text-right"
          style={{
            background: 'linear-gradient(135deg, rgba(16,185,129,0.16), rgba(255,255,255,0.7))',
            border: '1px solid rgba(16,185,129,0.25)',
          }}
        >
          <p className="text-[10px] font-bold text-emerald-900/70">סך ביצועים (60 יום)</p>
          <p className="text-2xl font-black text-emerald-900 tabular-nums">{summary.total}</p>
        </div>
        <div
          className="rounded-2xl p-3 text-right"
          style={{
            background: 'linear-gradient(135deg, rgba(56,189,248,0.18), rgba(255,255,255,0.7))',
            border: '1px solid rgba(56,189,248,0.25)',
          }}
        >
          <p className="text-[10px] font-bold text-sky-900/70">ימים פעילים (שבוע)</p>
          <p className="text-2xl font-black text-sky-900 tabular-nums">{summary.daysActive}/7</p>
        </div>
      </div>

      {/* Top tasks */}
      {summary.top.length > 0 && (
        <div
          className="rounded-2xl p-3 space-y-2"
          style={{
            background: 'rgba(255,255,255,0.55)',
            border: '1px solid rgba(16,185,129,0.18)',
          }}
        >
          <div className="flex items-center gap-2 justify-end">
            <Sparkles className="h-4 w-4 text-amber-500" />
            <p className="text-sm font-black text-[#1A1730]">משימות הכי פעילות שלך</p>
          </div>
          <ul className="space-y-1.5">
            {summary.top.map((row, idx) => (
              <li
                key={`${row.meta?.taskId ?? idx}-${idx}`}
                className="flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-[12px] font-semibold text-emerald-900 justify-between"
                style={{ background: 'rgba(236,253,245,0.7)' }}
              >
                <span className="tabular-nums text-emerald-700">×{row.count}</span>
                <span className="truncate text-right flex-1">
                  {row.meta ? row.meta.taskTitle : 'משימה'}
                </span>
                <span className="text-base shrink-0" aria-hidden>
                  {row.meta?.taskEmoji ?? '✅'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Day groups */}
      <div className="space-y-3">
        {groups.map((g) => (
          <div
            key={g.dateKey}
            className="rounded-[22px] p-[1px]"
            style={{
              background:
                'linear-gradient(145deg, rgba(52,211,153,0.45), rgba(167,243,208,0.25), rgba(255,255,255,0.65))',
            }}
          >
            <div
              className="rounded-[21px] px-3 py-3"
              style={{
                background: 'rgba(255,255,255,0.62)',
                border: '1px solid rgba(255,255,255,0.65)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.85)',
                backdropFilter: 'blur(10px)',
              }}
            >
              <div className="flex items-center justify-between flex-row-reverse mb-2">
                <div className="flex items-center gap-2 flex-row-reverse">
                  <CalendarDays className="h-4 w-4 text-emerald-700" />
                  <p className="text-sm font-black text-[#1A1730]">
                    {g.weekday ? `יום ${g.weekday} ` : ''}
                    {g.dateLabel}
                  </p>
                </div>
                <span
                  className="text-[11px] font-black tabular-nums px-2 py-0.5 rounded-full"
                  style={{
                    background:
                      'linear-gradient(135deg, rgba(16,185,129,0.95), rgba(52,211,153,0.85))',
                    color: '#fff',
                  }}
                >
                  {g.total} ביצועים
                </span>
              </div>
              <ul className="space-y-1.5">
                {g.items.map((item) => {
                  const time = new Date(item.execution.completed_at).toLocaleTimeString('he-IL', {
                    timeZone: 'Asia/Jerusalem',
                    hour: '2-digit',
                    minute: '2-digit',
                  });
                  return (
                    <li
                      key={item.execution.id}
                      className="flex items-center gap-2.5 rounded-xl px-2.5 py-2"
                      style={{
                        background: 'rgba(236,253,245,0.7)',
                        border: '1px solid rgba(16,185,129,0.16)',
                      }}
                    >
                      <span className="text-base shrink-0" aria-hidden>
                        {item.meta?.taskEmoji ?? '✅'}
                      </span>
                      <div className="min-w-0 flex-1 text-right">
                        <p className="text-[13px] font-bold text-[#1A1730] truncate">
                          {item.meta?.taskTitle ?? 'משימה'}
                        </p>
                        {item.meta ? (
                          <p className="text-[10px] font-semibold text-emerald-800/70 truncate">
                            צעד {item.meta.stepNumber}: {item.meta.stepTitle}
                          </p>
                        ) : null}
                      </div>
                      <span
                        className="text-[10px] font-bold tracking-wide text-emerald-900 bg-white/85 border border-emerald-300/55 rounded-full px-2 py-1 flex items-center gap-1 shrink-0"
                        title={`סלוט: ${slotLabel(item.execution.slot as JourneyTaskSlot)}`}
                      >
                        <span aria-hidden>{slotEmoji(item.execution.slot as JourneyTaskSlot)}</span>
                        <span>{slotLabel(item.execution.slot as JourneyTaskSlot)}</span>
                      </span>
                      <span className="text-[10px] font-semibold text-emerald-900/60 tabular-nums shrink-0">
                        {time}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

