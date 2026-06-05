import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

type Tone = 'emerald' | 'violet' | 'sky' | 'amber' | 'rose';

const ICON_TONES: Record<Tone, string> = {
  emerald: 'from-emerald-500 to-teal-600 shadow-emerald-600/30',
  violet: 'from-violet-500 to-fuchsia-600 shadow-violet-600/30',
  sky: 'from-sky-500 to-cyan-600 shadow-sky-600/30',
  amber: 'from-amber-500 to-orange-600 shadow-amber-600/30',
  rose: 'from-rose-500 to-pink-600 shadow-rose-600/30',
};

const TITLE_TONES: Record<Tone, string> = {
  emerald: 'from-emerald-700 via-teal-600 to-cyan-700',
  violet: 'from-violet-700 via-fuchsia-600 to-purple-700',
  sky: 'from-sky-700 via-cyan-600 to-teal-700',
  amber: 'from-amber-700 via-orange-600 to-rose-600',
  rose: 'from-rose-700 via-pink-600 to-fuchsia-700',
};

const EYEBROW_TONES: Record<Tone, string> = {
  emerald: 'text-emerald-700/85',
  violet: 'text-violet-700/85',
  sky: 'text-sky-700/85',
  amber: 'text-amber-700/85',
  rose: 'text-rose-700/85',
};

type OpsPageHeaderProps = {
  icon: LucideIcon;
  title: string;
  eyebrow?: string;
  description?: ReactNode;
  tone?: Tone;
  /** פעולות בצד הכותרת (כפתורים, מתגי טווח וכו') */
  actions?: ReactNode;
  className?: string;
};

/** כותרת עמוד אחידה לפאנל הניהול — זכוכית, אייקון גרדיאנט, מובייל-פירסט. */
export function OpsPageHeader({
  icon: Icon,
  title,
  eyebrow,
  description,
  tone = 'emerald',
  actions,
  className,
}: OpsPageHeaderProps) {
  return (
    <section
      className={cn(
        'overflow-hidden rounded-3xl border border-white/60 bg-white/45 p-4 shadow-[0_12px_40px_rgba(99,102,241,0.1)] backdrop-blur-xl sm:p-6',
        className,
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3 sm:gap-3.5">
          <span
            className={cn(
              'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-lg sm:h-12 sm:w-12',
              ICON_TONES[tone],
            )}
          >
            <Icon className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden />
          </span>
          <div className="min-w-0">
            {eyebrow ? (
              <p className={cn('text-[11px] font-bold uppercase tracking-wide sm:text-xs', EYEBROW_TONES[tone])}>
                {eyebrow}
              </p>
            ) : null}
            <h1
              className={cn(
                'bg-gradient-to-l bg-clip-text font-display text-2xl font-black leading-tight text-transparent sm:text-3xl',
                TITLE_TONES[tone],
              )}
            >
              {title}
            </h1>
            {description ? (
              <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-slate-600">{description}</p>
            ) : null}
          </div>
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </section>
  );
}
