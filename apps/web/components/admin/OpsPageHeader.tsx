import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

type Tone = 'emerald' | 'violet' | 'sky' | 'amber' | 'rose';

const TONES: Record<
  Tone,
  { icon: string; title: string; eyebrow: string; eyebrowText: string; glow: string; tint: string; ring: string }
> = {
  emerald: {
    icon: 'from-emerald-500 to-teal-600 shadow-emerald-600/40',
    title: 'from-emerald-700 via-teal-600 to-cyan-700',
    eyebrow: 'bg-emerald-500/15 text-emerald-700',
    eyebrowText: 'text-emerald-700',
    glow: 'bg-emerald-400/30',
    tint: 'from-emerald-100/60 via-background-card/20 to-cyan-100/40',
    ring: 'ring-emerald-200/50',
  },
  violet: {
    icon: 'from-violet-500 to-fuchsia-600 shadow-violet-600/40',
    title: 'from-violet-700 via-fuchsia-600 to-purple-700',
    eyebrow: 'bg-violet-500/15 text-violet-700',
    eyebrowText: 'text-violet-700',
    glow: 'bg-fuchsia-400/30',
    tint: 'from-violet-100/60 via-background-card/20 to-fuchsia-100/40',
    ring: 'ring-violet-200/50',
  },
  sky: {
    icon: 'from-sky-500 to-cyan-600 shadow-sky-600/40',
    title: 'from-sky-700 via-cyan-600 to-teal-700',
    eyebrow: 'bg-sky-500/15 text-sky-700',
    eyebrowText: 'text-sky-700',
    glow: 'bg-sky-400/30',
    tint: 'from-sky-100/60 via-background-card/20 to-cyan-100/40',
    ring: 'ring-sky-200/50',
  },
  amber: {
    icon: 'from-amber-500 to-orange-600 shadow-amber-600/40',
    title: 'from-amber-700 via-orange-600 to-rose-600',
    eyebrow: 'bg-amber-500/15 text-amber-700',
    eyebrowText: 'text-amber-700',
    glow: 'bg-amber-400/30',
    tint: 'from-amber-100/60 via-background-card/20 to-orange-100/40',
    ring: 'ring-amber-200/50',
  },
  rose: {
    icon: 'from-rose-500 to-pink-600 shadow-rose-600/40',
    title: 'from-rose-700 via-pink-600 to-fuchsia-700',
    eyebrow: 'bg-rose-500/15 text-rose-700',
    eyebrowText: 'text-rose-700',
    glow: 'bg-rose-400/30',
    tint: 'from-rose-100/60 via-background-card/20 to-fuchsia-100/40',
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
  // iOS "large title" header: no card/glow, just a clear title, small tinted icon and a gray subtitle.
  return (
    <section className={cn('px-1 pt-1', className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-[0.85rem] bg-linear-to-br text-white shadow-sm',
              t.icon,
            )}
          >
            <Icon className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0">
            {eyebrow ? <p className={cn('text-xs font-semibold', t.eyebrowText)}>{eyebrow}</p> : null}
            <h1 className="truncate font-display text-[1.75rem] font-black leading-tight tracking-tight text-slate-900 sm:text-[2rem]">
              {title}
            </h1>
          </div>
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {description ? <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-slate-500">{description}</p> : null}
    </section>
  );
}
