'use client';

import Link from 'next/link';
import { ChevronDown, Flame, MapPin } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import type {
  AdminUserJourneyStepRow,
  AdminUserJourneyTaskRow,
} from '@/lib/admin/build-user-journey-report';

const TASK_STATUS_HE: Record<string, string> = {
  accepted: 'קיבל',
  rejected: 'דחה',
  pending: 'ממתין',
  none: '—',
};

const SECTION_HE: Record<string, string> = {
  video: 'וידאו',
  quiz: 'חידון',
  game: 'משחק',
  commitment: 'התחייבות',
  summary: 'סיכום',
};

function groupByStation(steps: AdminUserJourneyStepRow[]) {
  const map = new Map<
    string,
    { title: string; sortOrder: number; steps: AdminUserJourneyStepRow[] }
  >();
  for (const step of steps) {
    const key = step.station_id ?? '__none__';
    if (!map.has(key)) {
      map.set(key, {
        title: step.station_title,
        sortOrder: step.station_sort_order,
        steps: [],
      });
    }
    map.get(key)!.steps.push(step);
  }
  return [...map.values()].sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, 'he'));
}

function DetailBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-bold text-slate-500 mb-1">{title}</p>
      {children}
    </div>
  );
}

function StepCard({ step }: { step: AdminUserJourneyStepRow }) {
  return (
    <article className="rounded-xl border border-slate-200/90 bg-white/90 p-3 space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-black text-slate-900">
            צעד {step.step_number}: {step.title}
          </p>
          <Link
            href={`/ops/steps/${step.id}`}
            className="text-[10px] text-emerald-700 hover:underline font-medium"
          >
            עריכת צעד ב-Ops
          </Link>
        </div>
        <div className="flex flex-wrap gap-1">
          {!step.is_published ? (
            <span className="text-[10px] rounded-md bg-slate-200 text-slate-700 px-1.5 py-0.5 font-bold">
              טיוטה
            </span>
          ) : null}
          {step.is_completed ? (
            <span className="text-[10px] rounded-md bg-emerald-600 text-white px-1.5 py-0.5 font-bold">
              הושלם
            </span>
          ) : step.started ? (
            <span className="text-[10px] rounded-md bg-sky-100 text-sky-900 px-1.5 py-0.5 font-bold">
              בתהליך
            </span>
          ) : null}
        </div>
      </div>

      {step.started ? (
        <ul className="flex flex-wrap gap-1.5 text-[10px]">
          {step.video_watched ? (
            <li className="rounded-md bg-sky-100 text-sky-900 px-1.5 py-0.5">צפה בוידאו</li>
          ) : null}
          {step.quiz_score != null ? (
            <li className="rounded-md bg-amber-100 text-amber-900 px-1.5 py-0.5">חידון: {step.quiz_score}</li>
          ) : null}
          {step.commitment_accepted ? (
            <li className="rounded-md bg-violet-100 text-violet-900 px-1.5 py-0.5">התחייבות</li>
          ) : null}
          {step.last_section ? (
            <li className="rounded-md bg-slate-100 text-slate-700 px-1.5 py-0.5">
              אחרון: {SECTION_HE[step.last_section] ?? step.last_section}
            </li>
          ) : null}
          {step.updated_at ? (
            <li className="rounded-md bg-slate-50 text-slate-500 px-1.5 py-0.5">
              עודכן {new Date(step.updated_at).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })}
            </li>
          ) : null}
        </ul>
      ) : (
        <p className="text-xs text-slate-400">לא התחיל צעד זה</p>
      )}

      {step.tasks.length > 0 ? (
        <DetailBlock title="משימות">
          <ul className="space-y-2">
            {step.tasks.map((t) => (
              <TaskRow key={t.id} task={t} />
            ))}
          </ul>
        </DetailBlock>
      ) : null}

      {step.habits.length > 0 ? (
        <DetailBlock title="הרגלים">
          <ul className="space-y-1">
            {step.habits.map((h) => (
              <li
                key={h.id}
                className="flex flex-wrap items-center justify-between gap-2 text-xs border-b border-slate-50 pb-1 last:border-0"
              >
                <span className="font-medium text-slate-800 min-w-0">{h.title}</span>
                <span className="flex flex-wrap items-center gap-1 shrink-0">
                  <span className="text-slate-600">
                    {h.total > 0 ? `סימוני היום ${h.checked}/${h.total}` : '—'}
                  </span>
                  {h.streak_current > 0 ? (
                    <span className="inline-flex items-center gap-0.5 rounded-md bg-orange-100 text-orange-900 px-1.5 py-0.5 font-bold">
                      <Flame className="w-3 h-3" />
                      {h.streak_current}
                    </span>
                  ) : null}
                  {h.streak_best > 0 && h.streak_best !== h.streak_current ? (
                    <span className="rounded-md bg-slate-100 text-slate-600 px-1.5 py-0.5">
                      שיא {h.streak_best}
                    </span>
                  ) : null}
                  {h.target_days != null ? (
                    <span
                      className={[
                        'rounded-md px-1.5 py-0.5 font-bold',
                        h.achieved
                          ? 'bg-emerald-600 text-white'
                          : 'bg-violet-100 text-violet-900',
                      ].join(' ')}
                    >
                      יעד {h.target_days}
                      {h.achieved ? ' ✓' : ''}
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </DetailBlock>
      ) : null}
    </article>
  );
}

function TaskExecutionDots({ task }: { task: AdminUserJourneyTaskRow }) {
  if (task.recent_executions.length === 0) return null;

  /** מציג 14 ימים אחרונים — נקודות בלוח ירושלים, מהישן לחדש (תצוגה RTL הופכת לימני→שמאל) */
  const recentMap = new Map(task.recent_executions.map((e) => [e.date_key, e.slot_count]));
  const days: { key: string; count: number }[] = [];
  const now = new Date();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const key = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Asia/Jerusalem',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
    days.push({ key, count: recentMap.get(key) ?? 0 });
  }

  return (
    <div className="mt-1 flex items-center gap-1 flex-wrap" title="14 ימים אחרונים (חדש משמאל)">
      {days.map((day) => (
        <span
          key={day.key}
          className={[
            'h-2.5 w-2.5 rounded-sm shrink-0',
            day.count >= 2
              ? 'bg-emerald-600'
              : day.count === 1
                ? 'bg-emerald-400'
                : 'bg-slate-200',
          ].join(' ')}
          title={`${day.key}: ${day.count} ביצועים`}
        />
      ))}
    </div>
  );
}

function TaskRow({ task }: { task: AdminUserJourneyTaskRow }) {
  return (
    <li className="space-y-1 border-b border-slate-50 pb-1.5 last:border-0">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="font-medium text-slate-800 min-w-0">{task.title}</span>
        <span className="flex flex-wrap items-center gap-1 shrink-0">
          <span
            className={[
              'rounded px-1.5 py-0.5 font-bold',
              task.status === 'accepted'
                ? 'bg-emerald-100 text-emerald-900'
                : task.status === 'rejected'
                  ? 'bg-red-100 text-red-800'
                  : task.status === 'pending'
                    ? 'bg-amber-100 text-amber-900'
                    : 'bg-slate-100 text-slate-500',
            ].join(' ')}
          >
            {TASK_STATUS_HE[task.status]}
          </span>
          {task.status === 'accepted' ? (
            <>
              {task.accepted_at ? (
                <span
                  className="rounded-md bg-violet-50 text-violet-900 border border-violet-200/60 px-1.5 py-0.5 font-bold"
                  title="מקובל עליי"
                >
                  קיבל{' '}
                  {new Date(task.accepted_at).toLocaleString('he-IL', {
                    timeZone: 'Asia/Jerusalem',
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              ) : null}
              {task.active_days_last_7 > 0 || task.active_days_last_30 > 0 ? (
                <span className="rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200/60 px-1.5 py-0.5 font-bold">
                  {task.active_days_last_7}/7 · {task.active_days_last_30}/30
                </span>
              ) : null}
              {task.missed_days_last_30 > 0 ? (
                <span className="rounded-md bg-rose-50 text-rose-800 border border-rose-200/60 px-1.5 py-0.5 font-bold">
                  {task.missed_days_last_30} פספוס
                </span>
              ) : null}
              <span
                className={[
                  'rounded px-1.5 py-0.5 font-bold',
                  task.execution_done ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600',
                ].join(' ')}
              >
                {task.execution_done ? 'בוצע פעם' : 'לא סומן'}
              </span>
            </>
          ) : null}
        </span>
      </div>
      {task.status === 'accepted' ? <TaskExecutionDots task={task} /> : null}
    </li>
  );
}

export function AdminUserJourneyDetail({ steps }: { steps: AdminUserJourneyStepRow[] }) {
  const [sectionOpen, setSectionOpen] = useState(true);
  const [showAllSteps, setShowAllSteps] = useState(false);

  const filteredSteps = useMemo(() => {
    if (showAllSteps || steps.length <= 24) return steps;
    return steps.filter((s) => s.started || s.is_completed);
  }, [steps, showAllSteps]);

  const groups = useMemo(() => groupByStation(filteredSteps), [filteredSteps]);

  if (steps.length === 0) {
    return (
      <p className="text-sm text-slate-500 border-t border-slate-100 pt-4">אין צעדי מסע במערכת.</p>
    );
  }

  const hasHidden = !showAllSteps && steps.length > 24 && filteredSteps.length < steps.length;

  return (
    <section className="border-t border-slate-200 pt-4 space-y-3">
      <button
        type="button"
        onClick={() => setSectionOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 text-right"
      >
        <span className="text-sm font-black text-slate-900 flex items-center gap-2">
          <MapPin className="w-4 h-4 text-emerald-600" />
          מסע — פירוט צעדים, משימות והרגלים
        </span>
        <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${sectionOpen ? 'rotate-180' : ''}`} />
      </button>

      {hasHidden ? (
        <p className="text-[11px] text-slate-500">
          מוצגים {filteredSteps.length} צעדים עם התקדמות מתוך {steps.length}.
        </p>
      ) : null}

      {sectionOpen ? (
        <>
          {hasHidden ? (
            <button
              type="button"
              onClick={() => setShowAllSteps(true)}
              className="text-xs font-bold text-emerald-700 hover:underline"
            >
              הצג את כל הצעדים ({steps.length})
            </button>
          ) : null}

          <div className="space-y-4 max-h-[min(52vh,520px)] overflow-y-auto pr-1">
            {groups.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-4">עדיין אין התקדמות במסע.</p>
            ) : (
              groups.map((group) => (
                <div key={group.title} className="space-y-2">
                  <h3 className="text-xs font-black text-emerald-900 sticky top-0 bg-white/95 py-1 z-10">
                    {group.title}
                  </h3>
                  <div className="space-y-2">
                    {group.steps.map((step) => (
                      <StepCard key={step.id} step={step} />
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      ) : null}
    </section>
  );
}
