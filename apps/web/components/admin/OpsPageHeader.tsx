import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

type Tone = 'emerald' | 'violet' | 'sky' | 'amber' | 'rose';

const TONES: Record<
  Tone,
  { icon: string; title: string; eyebrow: string; eyebrowText: string; glow: string; tint: string; ring: string }
> = {
  emerald: {
    icon: 'from-primary-500 to-secondary-600 shadow-primary-600/40',
    title: 'from-primary-700 via-secondary-600 to-secondary-700',
    eyebrow: 'bg-primary-500/15 text-primary-700',
    eyebrowText: 'text-primary-700',
    glow: 'bg-primary-400/30',
    tint: 'from-primary-100/60 via-background-card/20 to-secondary-100/40',
    ring: 'ring-primary-200/50',
  },
  violet: {
    icon: 'from-iris-500 to-iris-600 shadow-iris-600/40',
    title: 'from-iris-700 via-iris-600 to-iris-700',
    eyebrow: 'bg-iris-500/15 text-iris-700',
    eyebrowText: 'text-iris-700',
    glow: 'bg-iris-400/30',
    tint: 'from-iris-100/60 via-background-card/20 to-iris-100/40',
    ring: 'ring-iris-200/50',
  },
  sky: {
    icon: 'from-secondary-500 to-secondary-600 shadow-secondary-600/40',
    title: 'from-secondary-700 via-secondary-600 to-secondary-700',
    eyebrow: 'bg-secondary-500/15 text-secondary-700',
    eyebrowText: 'text-secondary-700',
    glow: 'bg-secondary-400/30',
    tint: 'from-secondary-100/60 via-background-card/20 to-secondary-100/40',
    ring: 'ring-secondary-200/50',
  },
  amber: {
    icon: 'from-accent-500 to-energy-600 shadow-accent-600/40',
    title: 'from-accent-700 via-energy-600 to-coral-600',
    eyebrow: 'bg-accent-500/15 text-accent-700',
    eyebrowText: 'text-accent-700',
    glow: 'bg-accent-400/30',
    tint: 'from-accent-100/60 via-background-card/20 to-energy-100/40',
    ring: 'ring-accent-200/50',
  },
  rose: {
    icon: 'from-coral-500 to-coral-600 shadow-coral-600/40',
    title: 'from-coral-700 via-coral-600 to-iris-700',
    eyebrow: 'bg-coral-500/15 text-coral-700',
    eyebrowText: 'text-coral-700',
    glow: 'bg-coral-400/30',
    tint: 'from-coral-100/60 via-background-card/20 to-iris-100/40',
    ring: 'ring-coral-200/50',
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
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-[0.85rem] bg-linear-to-br text-gc shadow-sm',
              t.icon,
            )}
          >
            <Icon className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0">
            {eyebrow ? <p className={cn('text-xs font-semibold', t.eyebrowText)}>{eyebrow}</p> : null}
            <h1 className="truncate font-display text-[1.75rem] font-black leading-tight tracking-tight text-ink sm:text-[2rem]">
              {title}
            </h1>
          </div>
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {description ? <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-ink-faint">{description}</p> : null}
    </section>
  );
}
