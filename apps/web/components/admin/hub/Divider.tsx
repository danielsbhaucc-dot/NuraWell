import { cn } from '@/lib/cn';

/**
 * C3v2 glass divider. Hairlines are 1px with a soft tint that fades out at both edges (never a hard line,
 * never a yellow→green gradient, no solid backgrounds).
 *  - variant "hair":    between rows / card header and body (tone emerald | teal | gold)
 *  - variant "section": between groups; small gold diamond in the middle, or a label pill when `label` is set
 * Decorative (aria-hidden) unless labeled, in which case it is a separator with a name.
 */
type Tone = 'emerald' | 'teal' | 'gold';
const LINE: Record<Tone, string> = {
  emerald: 'via-primary-700/25',
  teal: 'via-secondary-600/25',
  gold: 'via-accent-500/35',
};

export function Divider({ variant = 'hair', tone = 'emerald', label, count, className }: { variant?: 'hair' | 'section'; tone?: Tone; label?: string; count?: number; className?: string }) {
  const line = (side: 'start' | 'end' | 'full') => (
    <span aria-hidden className={cn('relative h-px flex-1 bg-linear-to-l from-transparent to-transparent', LINE[tone],
      side === 'start' && 'to-transparent', 'after:absolute after:inset-x-0 after:top-px after:h-px after:bg-linear-to-l after:from-transparent after:via-glass/40 after:to-transparent')} />
  );
  if (variant === 'hair') return <div role="presentation" className={cn('flex', className)}>{line('full')}</div>;
  return (
    <div role={label ? 'separator' : 'presentation'} aria-label={label} className={cn('flex items-center gap-3', className)}>
      {line('start')}
      {label ? (
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-accent-400/30 bg-glass/35 px-3 py-1 font-[Rubik] text-[12px] font-bold text-secondary-900 shadow-[0_4px_14px_-6px_rgba(6,78,59,0.35)] backdrop-blur-md">
          <span aria-hidden className="h-1.5 w-1.5 rotate-45 rounded-[1px] bg-accent-500/80" />
          {label}
          {count !== undefined ? <span className="tabular-nums text-accent-700">{count}</span> : null}
        </span>
      ) : (
        <span aria-hidden className="h-2 w-2 shrink-0 rotate-45 rounded-[2px] border border-accent-500/60 bg-accent-400/30 shadow-[0_0_10px_rgba(217,119,6,0.35)]" />
      )}
      {line('end')}
    </div>
  );
}
