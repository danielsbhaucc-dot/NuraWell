import type { PlanHabit } from '@/lib/plans/plan-document';
import { formatPlanDate } from '@/lib/plans/plan-document';
import { LadderActions } from './LadderActions';
import { Pill, Tile } from '@/components/ui';

const STATUS_STYLE: Record<PlanHabit['status'], 'forest' | 'mint' | 'amber'> = {
  original: 'forest',
  eased: 'mint',
  stretched: 'amber',
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
      className="relative scroll-mt-24 overflow-hidden rounded-[28px] bg-glass/80 backdrop-blur-xl backdrop-saturate-150 p-4 pt-5 shadow-[inset_0_1px_0_rgba(242,242,246,0.55),0_1px_2px_rgba(4,20,14,0.06),0_14px_36px_-12px_rgba(4,20,14,0.22)] ring-1 ring-hairline/70 transition-shadow before:absolute before:inset-x-0 before:top-0 before:h-1 before:bg-linear-to-l before:from-primary-500 before:via-secondary-400 before:to-accent-300 data-[highlight=true]:ring-4 data-[highlight=true]:ring-primary-300/70"
    >
      <div className="flex items-start gap-3">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-[16px] bg-linear-to-br from-primary-500/18 to-secondary-500/14 text-2xl ring-1 ring-inset ring-primary-600/15 shadow-[inset_0_1px_0_rgba(242,242,246,0.5)]" aria-hidden>
          {habit.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Pill tone={STATUS_STYLE[habit.status]}>{habit.statusLabel}</Pill>
            {habit.isMain ? <Pill tone="glass" className="text-primary-800">המיקוד</Pill> : null}
          </div>
          <h3 className="mt-1 text-[17px] font-extrabold leading-snug text-primary-900">{habit.currentStep}</h3>
          {habit.currentStep !== habit.habitTitle ? <p className="mt-0.5 text-xs text-primary-800/65">בדרך אל: {habit.habitTitle}</p> : null}
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-primary-900/10" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="התקדמות היום">
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

      <details className="group mt-3 rounded-[20px] bg-surface-sunken/70 ring-1 ring-hairline/70 backdrop-blur-md">
        <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2.5 text-[13px] font-bold text-primary-700 [&::-webkit-details-marker]:hidden">
          <span>הצעדים ויום קשה</span>
          <svg aria-hidden viewBox="0 0 20 20" className="size-4 transition-transform group-open:rotate-180">
            <path d="M5 8l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </summary>
        <div className="flex flex-col gap-2.5 px-3 pb-3">
          <dl className="grid grid-cols-2 gap-2">
            <Tile tone="forest" accent="glow"><dt className="text-[11px] font-bold text-glow">הצעד הבא</dt>
              <dd className="mt-0.5 text-[13px] font-semibold leading-snug text-on-dark">{habit.nextStep ?? 'שומרים על מה שבנינו'}</dd>
            </Tile>
            <Tile accent="amber"><dt className="text-[11px] font-bold text-accent-800">ביום קשה</dt>
              <dd className="mt-0.5 text-[13px] font-semibold leading-snug text-ink">{habit.fallbackStep ?? 'גם חצי צעד נחשב'}</dd>
            </Tile>
          </dl>
          {habit.ladder.length > 1 ? (
            <ol className="flex items-center gap-1" aria-label="סולם הקושי">
              {habit.ladder.map((l) => (
                <li key={l.level} className={`h-1.5 flex-1 rounded-full ${l.current ? 'bg-brand-700' : l.reached ? 'bg-primary-300' : 'bg-primary-900/10'}`}>
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
