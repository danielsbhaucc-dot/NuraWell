import type { HTMLAttributes } from 'react';
import { cn } from './cn';

type Tone = 'glass' | 'elevated' | 'sunken' | 'dark';
const tones: Record<Tone, string> = {
  // Canonical product card (PlanHabitCard / AlmogPlanSections): translucent glass, soft forest shadow, hairline ring.
  glass: 'bg-surface/85 backdrop-blur-md ring-1 ring-forest-900/6 shadow-[0_10px_28px_rgba(6,78,59,0.08)]',
  elevated: 'bg-surface-elevated/95 backdrop-blur-xl ring-1 ring-hairline shadow-lift',
  sunken: 'bg-surface-sunken/80 ring-1 ring-hairline/70',
  dark: 'bg-linear-to-br from-forest-900 to-forest-700 text-on-dark ring-1 ring-glow/15 shadow-lift',
};

export type SurfaceProps = HTMLAttributes<HTMLDivElement> & { tone?: Tone; accent?: boolean };

/** Base material. `accent` adds the signature 4px emerald→teal top bar. */
export function Surface({ tone = 'glass', accent, className, ...rest }: SurfaceProps) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-[24px] p-4',
        tones[tone],
        accent && 'pt-5 before:absolute before:inset-x-0 before:top-0 before:h-1 before:bg-linear-to-l before:from-primary-500 before:to-secondary-400',
        className
      )}
      {...rest}
    />
  );
}

export function Card(props: SurfaceProps) {
  return <Surface {...props} />;
}

export function CardTitle({ className, ...rest }: HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn('font-display text-[17px] font-extrabold leading-snug text-brand border-b border-brand-accent/20 pb-2 mb-3', className)} {...rest} />;
}
