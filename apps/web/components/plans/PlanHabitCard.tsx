import type { PlanHabit } from '@/lib/plans/plan-document';
import { formatPlanDate } from '@/lib/plans/plan-document';
import { LadderActions } from './LadderActions';

const STATUS_STYLE: Record<PlanHabit['status'], string> = {
  original: 'bg-brand-700 text-white',
  eased: 'bg-primary-100 text-brand-700',
  stretched: 'bg-accent-100 text-accent-800',
};

/** One habit as a plan entry: where you are, the step after, the safety net, and why Almog changed it. */
export function PlanHabitCard({ habit, index, canStepDown, canStepUp }: { habit: PlanHabit; index: number; canStepDown: boolean; canStepUp: boolean }) {
  const pct = Math.min(100, Math.round((habit.doneToday / Math.max(1, habit.targetToday)) * 100));
  return (
    <article className="overflow-hidden rounded-3xl border border-primary-100 bg-background-card shadow-[0_8px_24px_rgba(6,78,59,0.07)]">
      <header className="flex items-start gap-3 border-b border-primary-100/80 bg-primary-50/60 px-4 py-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-cream text-2xl shadow-xs" aria-hidden>
          {habit.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold tracking-wide text-primary-700">
            הרגל {index}
            {habit.isMain ? ' · המיקוד שלך' : ''}
          </p>
          <h3 className="text-base font-black leading-snug text-primary-900">{habit.habitTitle}</h3>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${STATUS_STYLE[habit.status]}`}>{habit.statusLabel}</span>
      </header>

      <div className="flex flex-col gap-3 px-4 py-4">
        <dl className="flex flex-col gap-2.5">
          <div className="rounded-2xl bg-brand-700 px-3.5 py-3 text-white">
            <dt className="text-[11px] font-bold text-white/70">הצעד שלך עכשיו</dt>
            <dd className="mt-0.5 text-[15px] font-extrabold leading-snug">{habit.currentStep}</dd>
            <div className="mt-2 flex items-center gap-2 text-[11px] text-white/80">
              <span>
                היום {habit.doneToday}/{habit.targetToday}
              </span>
              <span aria-hidden>·</span>
              <span>רצף {habit.streakDays} {habit.streakDays === 1 ? 'יום' : 'ימים'}</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/20" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="התקדמות היום">
              <div className="h-full rounded-full bg-primary-300" style={{ width: `${pct}%` }} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-2xl border border-primary-100 bg-cream/80 px-3 py-2.5">
              <dt className="text-[11px] font-bold text-primary-700">הצעד הבא</dt>
              <dd className="mt-0.5 text-[13px] font-semibold leading-snug text-primary-900">{habit.nextStep ?? 'שומרים על מה שבנינו'}</dd>
            </div>
            <div className="rounded-2xl border border-primary-100 bg-cream/80 px-3 py-2.5">
              <dt className="text-[11px] font-bold text-primary-700">צעד גיבוי ליום קשה</dt>
              <dd className="mt-0.5 text-[13px] font-semibold leading-snug text-primary-900">{habit.fallbackStep ?? 'גם יום של חצי צעד נחשב'}</dd>
            </div>
          </div>
        </dl>

        {habit.ladder.length > 1 ? (
          <ol className="flex items-center gap-1" aria-label="שלבי ההרגל">
            {habit.ladder.map((l) => (
              <li key={l.level} className={`h-1.5 flex-1 rounded-full ${l.current ? 'bg-brand-700' : l.reached ? 'bg-primary-300' : 'bg-primary-100'}`}>
                <span className="sr-only">{l.current ? 'השלב הנוכחי' : l.level === 0 ? 'ההרגל המלא' : `שלב ${l.level}`}</span>
              </li>
            ))}
          </ol>
        ) : null}
        <p className="text-xs leading-relaxed text-primary-800/80">{habit.progressNote}</p>

        {habit.latestNote ? (
          <figure className="rounded-2xl border-s-4 border-primary-300 bg-primary-50/70 px-3.5 py-2.5">
            <figcaption className="text-[11px] font-bold text-primary-700">הערה של אלמוג · {formatPlanDate(habit.latestNote.at)}</figcaption>
            <p className="mt-1 text-[13px] leading-relaxed text-primary-900">{habit.latestNote.text}</p>
            {habit.latestNote.quote ? <blockquote className="mt-1 text-xs italic text-primary-800/75">״{habit.latestNote.quote}״</blockquote> : null}
          </figure>
        ) : null}

        <LadderActions assignmentId={habit.id} title={habit.currentStep} eased={habit.status === 'eased'} canStepDown={canStepDown} canStepUp={canStepUp} />
      </div>
    </article>
  );
}
