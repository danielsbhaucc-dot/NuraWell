import type { PlanHabit } from '@/lib/plans/plan-document';
import { formatPlanDate } from '@/lib/plans/plan-document';
import { LadderActions } from './LadderActions';

const STATUS_STYLE: Record<PlanHabit['status'], string> = {
  original: 'bg-brand-700 text-cream',
  eased: 'bg-primary-100 text-brand-700',
  stretched: 'bg-accent-100 text-accent-800',
};

/** One habit, clean first view (step + today), with the ladder, fallback and Almog's reason folded away. */
export function PlanHabitCard({ habit, canStepDown, canStepUp, highlighted }: { habit: PlanHabit; canStepDown: boolean; canStepUp: boolean; highlighted?: boolean }) {
  const pct = Math.min(100, Math.round((habit.doneToday / Math.max(1, habit.targetToday)) * 100));
  const doneToday = habit.doneToday >= habit.targetToday && habit.targetToday > 0;
  return (
    <article
      id={`task-${habit.id}`}
      data-task-id={habit.id}
      data-highlight={highlighted ? 'true' : undefined}
      className="relative scroll-mt-24 overflow-hidden rounded-[24px] bg-white p-4 pt-5 shadow-[0_10px_28px_rgba(6,78,59,0.08)] ring-1 ring-emerald-900/6 transition-shadow before:absolute before:inset-x-0 before:top-0 before:h-1 before:bg-linear-to-l before:from-emerald-500 before:via-teal-400 before:to-amber-300 data-[highlight=true]:ring-4 data-[highlight=true]:ring-primary-300/70"
    >
      <div className="flex items-start gap-3">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-linear-to-br from-primary-50 to-primary-100 text-2xl" aria-hidden>
          {habit.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_STYLE[habit.status]}`}>{habit.statusLabel}</span>
            {habit.isMain ? <span className="rounded-full bg-cream px-2 py-0.5 text-[10px] font-bold text-primary-700 ring-1 ring-primary-200">המיקוד</span> : null}
          </div>
          <h3 className="mt-1 text-[17px] font-extrabold leading-snug text-primary-900">{habit.currentStep}</h3>
          {habit.currentStep !== habit.habitTitle ? <p className="mt-0.5 text-xs text-primary-800/65">בדרך אל: {habit.habitTitle}</p> : null}
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-primary-50" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="התקדמות היום">
          <div className="h-full rounded-full bg-linear-to-l from-brand-700 to-primary-500" style={{ width: `${pct}%` }} />
        </div>
        <span className="shrink-0 text-xs font-bold text-primary-800">
          {doneToday ? 'הושלם היום ✓' : `היום ${habit.doneToday}/${habit.targetToday}`}
          {habit.streakDays > 0 ? ` · ${habit.streakDays} ${habit.streakDays === 1 ? 'יום' : 'ימים'} ברצף` : ''}
        </span>
      </div>

      <div className="mt-3">
        <LadderActions assignmentId={habit.id} title={habit.currentStep} eased={habit.status === 'eased'} canStepDown={canStepDown} canStepUp={canStepUp} />
      </div>

      <details className="group mt-3 rounded-2xl bg-emerald-50/70 ring-1 ring-emerald-100">
        <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2.5 text-[13px] font-bold text-primary-700 [&::-webkit-details-marker]:hidden">
          <span>הצעדים ויום קשה</span>
          <svg aria-hidden viewBox="0 0 20 20" className="size-4 transition-transform group-open:rotate-180">
            <path d="M5 8l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </summary>
        <div className="flex flex-col gap-2.5 px-3 pb-3">
          <dl className="grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-white px-3 py-2 ring-1 ring-emerald-100">
              <dt className="text-[11px] font-bold text-emerald-700">הצעד הבא</dt>
              <dd className="mt-0.5 text-[13px] font-semibold leading-snug text-primary-900">{habit.nextStep ?? 'שומרים על מה שבנינו'}</dd>
            </div>
            <div className="rounded-xl bg-white px-3 py-2 ring-1 ring-amber-100">
              <dt className="text-[11px] font-bold text-amber-700">ביום קשה</dt>
              <dd className="mt-0.5 text-[13px] font-semibold leading-snug text-primary-900">{habit.fallbackStep ?? 'גם חצי צעד נחשב'}</dd>
            </div>
          </dl>
          {habit.ladder.length > 1 ? (
            <ol className="flex items-center gap-1" aria-label="סולם הקושי">
              {habit.ladder.map((l) => (
                <li key={l.level} className={`h-1.5 flex-1 rounded-full ${l.current ? 'bg-brand-700' : l.reached ? 'bg-primary-300' : 'bg-primary-100'}`}>
                  <span className="sr-only">{l.current ? 'השלב הנוכחי' : l.level === 0 ? 'ההרגל המלא' : `שלב ${l.level}`}</span>
                </li>
              ))}
            </ol>
          ) : null}
          <p className="text-xs leading-relaxed text-primary-800/80">{habit.progressNote}</p>
          {habit.latestNote ? (
            <p className="border-s-2 border-primary-300 ps-2.5 text-[13px] leading-relaxed text-primary-900">
              <span className="block text-[11px] font-bold text-primary-700">למה אלמוג שינה · {formatPlanDate(habit.latestNote.at)}</span>
              {habit.latestNote.text}
              {habit.latestNote.quote ? <span className="block text-xs italic text-primary-800/75">״{habit.latestNote.quote}״</span> : null}
            </p>
          ) : null}
        </div>
      </details>
    </article>
  );
}
