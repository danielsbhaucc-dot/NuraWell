import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

type Tone = 'emerald' | 'violet' | 'sky' | 'amber' | 'rose';

const TONES: Record<
  Tone,
  { icon: string; title: string; eyebrow: string; glow: string; tint: string; ring: string }
> = {
  emerald: {
    icon: 'from-emerald-500 to-teal-600 shadow-emerald-600/40',
    title: 'from-emerald-700 via-teal-600 to-cyan-700',
    eyebrow: 'bg-emerald-500/15 text-emerald-700',
    glow: 'bg-emerald-400/30',
    tint: 'from-emerald-100/60 via-white/20 to-cyan-100/40',
    ring: 'ring-emerald-200/50',
  },
  violet: {
    icon: 'from-violet-500 to-fuchsia-600 shadow-violet-600/40',
    title: 'from-violet-700 via-fuchsia-600 to-purple-700',
    eyebrow: 'bg-violet-500/15 text-violet-700',
    glow: 'bg-fuchsia-400/30',
    tint: 'from-violet-100/60 via-white/20 to-fuchsia-100/40',
    ring: 'ring-violet-200/50',
  },
  sky: {
    icon: 'from-sky-500 to-cyan-600 shadow-sky-600/40',
    title: 'from-sky-700 via-cyan-600 to-teal-700',
    eyebrow: 'bg-sky-500/15 text-sky-700',
    glow: 'bg-sky-400/30',
    tint: 'from-sky-100/60 via-white/20 to-cyan-100/40',
    ring: 'ring-sky-200/50',
  },
  amber: {
    icon: 'from-amber-500 to-orange-600 shadow-amber-600/40',
    title: 'from-amber-700 via-orange-600 to-rose-600',
    eyebrow: 'bg-amber-500/15 text-amber-700',
    glow: 'bg-amber-400/30',
    tint: 'from-amber-100/60 via-white/20 to-orange-100/40',
    ring: 'ring-amber-200/50',
  },
  rose: {
    icon: 'from-rose-500 to-pink-600 shadow-rose-600/40',
    title: 'from-rose-700 via-pink-600 to-fuchsia-700',
    eyebrow: 'bg-rose-500/15 text-rose-700',
    glow: 'bg-rose-400/30',
    tint: 'from-rose-100/60 via-white/20 to-fuchsia-100/40',
    ring: 'ring-rose-200/50',
  },
};

type OpsPageHeaderProps = {
  icon: LucideIcon;
  title: string;
  eyebrow?: string;
  description?: ReactNode;
  tone?: Tone;
  actions?: ReactNode;
  className?: string;
};

/** כותרת עמוד אחידה לפאנל הניהול — זכוכית צבעונית, אייקון גרדיאנט, מובייל-פירסט. */
export function OpsPageHeader({
  icon: Icon,
  title,
  eyebrow,
  description,
  tone = 'emerald',
  actions,
  className,
}: OpsPageHeaderProps) {
  const t = TONES[tone];
  return (
    <section
      className={cn(
        'relative overflow-hidden rounded-[1.75rem] border border-white/60 bg-white/45 p-5 shadow-[0_18px_50px_-12px_rgba(15,23,42,0.22)] ring-1 ring-inset ring-white/40 backdrop-blur-2xl sm:p-7',
        className,
      )}
    >
      {/* גוון רקע צבעוני */}
      <div className={cn('pointer-events-none absolute inset-0 -z-10 bg-gradient-to-bl opacity-80', t.tint)} aria-hidden />
      {/* אורב זוהר דקורטיבי */}
      <div className={cn('pointer-events-none absolute -left-10 -top-16 h-44 w-44 rounded-full blur-3xl', t.glow)} aria-hidden />
      {/* נצנוץ עליון */}
      <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent" aria-hidden />

      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3.5">
          <span
            className={cn(
              'flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-lg ring-1 ring-white/50 sm:h-14 sm:w-14',
              t.icon,
            )}
          >
            <Icon className="h-6 w-6 sm:h-7 sm:w-7" aria-hidden />
          </span>
          <div className="min-w-0">
            {eyebrow ? (
              <span
                className={cn(
                  'mb-1.5 inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold tracking-wide backdrop-blur-sm sm:text-xs',
                  t.eyebrow,
                )}
              >
                {eyebrow}
              </span>
            ) : null}
            <h1
              className={cn(
                'block bg-gradient-to-l bg-clip-text font-display text-[1.6rem] font-black leading-tight text-transparent sm:text-3xl',
                t.title,
              )}
            >
              {title}
            </h1>
            {description ? (
              <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-slate-600">{description}</p>
            ) : null}
          </div>
        </div>
        {actions ? <div className="relative flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </section>
  );
}
