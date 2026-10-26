import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';
import { forwardRef } from 'react';
import { cn } from './cn';

/**
 * iOS-refined glass primitives. Continuous large radii, frosted blur, a thin inner highlight,
 * layered soft shadows, press states (motion-safe only). No white / near-white fills — ever.
 */
const PRESS = 'transition-[transform,box-shadow,background-color] duration-200 ease-out motion-safe:active:scale-[0.97] motion-reduce:transition-none';
const HIGHLIGHT = 'shadow-[inset_0_1px_0_rgba(238,244,234,0.55),0_1px_2px_rgba(4,20,14,0.06),0_10px_30px_-10px_rgba(4,20,14,0.22)]';

export type GlassCardProps = HTMLAttributes<HTMLDivElement> & { tone?: 'light' | 'dark'; accent?: boolean };
/** Frosted card. tone="light" = product glass on canvas, tone="dark" = forest glass on dark shells. */
export function GlassCard({ tone = 'light', accent, className, ...rest }: GlassCardProps) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-[28px] backdrop-blur-xl backdrop-saturate-150',
        tone === 'light' ? cn('bg-glass/80 ring-1 ring-hairline/70', HIGHLIGHT) : 'bg-forest-900/55 text-on-dark ring-1 ring-on-dark/10 shadow-[inset_0_1px_0_rgba(238,244,234,0.08),0_18px_48px_-12px_rgba(4,20,14,0.5)]',
        accent && 'before:absolute before:inset-x-0 before:top-0 before:h-1 before:bg-linear-to-l before:from-glow before:to-glow-teal',
        className,
      )}
      {...rest}
    />
  );
}

type TileAccent = 'glow' | 'amber' | 'none';
const tileBar: Record<TileAccent, string> = {
  glow: 'before:bg-linear-to-l before:from-glow before:to-glow-teal',
  amber: 'before:bg-linear-to-l before:from-accent-400 before:to-energy-400',
  none: 'before:hidden',
};
export type TileProps = HTMLAttributes<HTMLDivElement> & { accent?: TileAccent; tone?: 'glass' | 'forest'; label?: ReactNode };
/** Small info tile with a top accent bar. forest = primary emphasis, glass = secondary. */
export function Tile({ accent = 'none', tone = 'glass', label, className, children, ...rest }: TileProps) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-[18px] px-3.5 py-3 before:absolute before:inset-x-3 before:top-0 before:h-[3px] before:rounded-b-full',
        tone === 'forest'
          ? 'bg-linear-to-br from-forest-800 to-forest-700 text-on-dark ring-1 ring-glow/20 shadow-[inset_0_1px_0_rgba(238,244,234,0.12),0_12px_28px_-10px_rgba(4,20,14,0.45)]'
          : cn('bg-glass-hi/70 text-ink ring-1 ring-hairline/70 backdrop-blur-xl', HIGHLIGHT),
        tileBar[accent],
        className,
      )}
      {...rest}
    >
      {label ? <div className={cn('text-[11px] font-bold tracking-[0.01em]', tone === 'forest' ? 'text-glow' : accent === 'amber' ? 'text-accent-800' : 'text-ink-soft')}>{label}</div> : null}
      {children}
    </div>
  );
}

type PillTone = 'forest' | 'mint' | 'amber' | 'glass';
const pillTones: Record<PillTone, string> = {
  forest: 'bg-forest-800 text-on-dark ring-glow/25',
  mint: 'bg-primary-500/14 text-primary-800 ring-primary-600/20',
  amber: 'bg-accent-400/18 text-accent-800 ring-accent-600/25',
  glass: 'bg-glass-hi/70 text-ink-soft ring-hairline backdrop-blur-md',
};
/** Static status pill (non-interactive). */
export function Pill({ tone = 'mint', className, ...rest }: HTMLAttributes<HTMLSpanElement> & { tone?: PillTone }) {
  return <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-[3px] text-[10.5px] font-bold leading-4 ring-1 ring-inset shadow-[inset_0_1px_0_rgba(238,244,234,0.35)]', pillTones[tone], className)} {...rest} />;
}

export type ChipProps = ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'mint' | 'amber' | 'forest' };
const chipTones = {
  mint: 'bg-primary-500/12 text-primary-800 ring-primary-600/20 hover:bg-primary-500/18',
  amber: 'bg-accent-400/16 text-accent-800 ring-accent-600/25 hover:bg-accent-400/24',
  forest: 'bg-linear-to-br from-forest-700 to-primary-700 text-on-dark ring-glow/25 hover:brightness-110',
};
/** Tappable chip (≥40px). Frosted, inner highlight, press scale only when motion is allowed. */
export const Chip = forwardRef<HTMLButtonElement, ChipProps>(function Chip({ tone = 'mint', className, type = 'button', ...rest }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex min-h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-[13px] font-bold ring-1 ring-inset backdrop-blur-md',
        'shadow-[inset_0_1px_0_rgba(238,244,234,0.4),0_4px_14px_-6px_rgba(4,20,14,0.25)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 disabled:opacity-40',
        PRESS,
        chipTones[tone],
        className,
      )}
      {...rest}
    />
  );
});

/** Section title row: title + optional caption and trailing action (RTL-native). */
export function SectionHeader({ title, caption, action, className }: { title: ReactNode; caption?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-end justify-between gap-3 px-1', className)}>
      <div className="min-w-0">
        <h2 className="text-[19px] font-extrabold tracking-[-0.01em] text-ink">{title}</h2>
        {caption ? <p className="mt-0.5 text-[13px] text-ink-faint">{caption}</p> : null}
      </div>
      {action}
    </div>
  );
}

/** Inline toast (role=status). Place inside a fixed container; dismissal is the caller's job. */
export function Toast({ tone = 'neutral', children, className }: { tone?: 'neutral' | 'success' | 'error'; children: ReactNode; className?: string }) {
  const t = tone === 'success' ? 'ring-glow/30' : tone === 'error' ? 'ring-coral-400/40' : 'ring-on-dark/10';
  return (
    <div role="status" aria-live="polite" className={cn('rounded-[20px] bg-forest-900/85 px-4 py-3 text-[14px] font-semibold text-on-dark ring-1 backdrop-blur-xl shadow-[0_18px_40px_-12px_rgba(4,20,14,0.55)]', t, className)}>
      {children}
    </div>
  );
}
