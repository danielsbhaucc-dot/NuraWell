import { forwardRef, type HTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from './cn';

/** Text input on a sunken well — never a white box. */
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return (
    <input
      ref={ref}
      className={cn(
        'min-h-12 w-full rounded-2xl bg-surface-sunken/80 px-4 text-base text-ink ring-1 ring-hairline placeholder:text-ink-faint',
        'transition-shadow focus:outline-hidden focus:ring-2 focus:ring-primary-500/60 focus:shadow-[0_0_0_6px_rgba(16,185,129,0.12)]',
        className
      )}
      {...rest}
    />
  );
});

type BannerTone = 'info' | 'success' | 'warn' | 'danger';
const bannerTones: Record<BannerTone, string> = {
  info: 'bg-primary-500/10 text-primary-900 ring-primary-500/25',
  success: 'bg-primary-500/15 text-primary-900 ring-primary-500/30',
  warn: 'bg-accent-500/12 text-accent-900 ring-accent-500/30',
  danger: 'bg-energy-500/12 text-energy-700 ring-energy-500/30',
};
export function Banner({ tone = 'info', icon, title, children, action, className }: { tone?: BannerTone; icon?: ReactNode; title: ReactNode; children?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cn('flex items-start gap-3 rounded-2xl p-3.5 ring-1 backdrop-blur-md', bannerTones[tone], className)}>
      {icon ? <span className="mt-0.5 shrink-0 text-lg" aria-hidden>{icon}</span> : null}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-extrabold">{title}</p>
        {children ? <div className="mt-0.5 text-[13px] leading-relaxed opacity-90">{children}</div> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

type BadgeTone = 'brand' | 'soft' | 'warm' | 'dark';
const badgeTones: Record<BadgeTone, string> = {
  brand: 'bg-brand-700 text-on-dark',
  soft: 'bg-primary-500/12 text-brand-700 ring-1 ring-primary-500/20',
  warm: 'bg-accent-500/15 text-accent-800',
  dark: 'bg-forest-800 text-on-dark-soft ring-1 ring-glow/20',
};
export function Badge({ tone = 'soft', className, ...rest }: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-bold', badgeTones[tone], className)} {...rest} />;
}

/** Admin/list row: hairline-separated, hover tint, RTL-native (leading = start). */
export function ListRow({ leading, title, meta, trailing, className, ...rest }: Omit<HTMLAttributes<HTMLDivElement>, 'title'> & { leading?: ReactNode; title: ReactNode; meta?: ReactNode; trailing?: ReactNode }) {
  return (
    <div className={cn('flex items-center gap-3 border-b border-hairline/60 px-3 py-2.5 transition-colors last:border-b-0 hover:bg-primary-500/5', className)} {...rest}>
      {leading ? <div className="shrink-0">{leading}</div> : null}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-bold text-ink">{title}</div>
        {meta ? <div className="truncate text-xs text-ink-faint">{meta}</div> : null}
      </div>
      {trailing ? <div className="shrink-0">{trailing}</div> : null}
    </div>
  );
}

/** Branded loading: breathing emerald orb, honours reduced-motion. */
export function LoadingState({ label = 'רגע, טוענים…' }: { label?: string }) {
  return (
    <div role="status" className="flex flex-col items-center gap-3 py-12 text-center">
      <span aria-hidden className="relative flex size-12 items-center justify-center">
        <span className="absolute inset-0 animate-ping rounded-full bg-glow/30 motion-reduce:animate-none" />
        <span className="size-8 rounded-full bg-linear-to-br from-primary-600 to-secondary-400 shadow-[0_0_24px_rgba(52,211,153,0.55)]" />
      </span>
      <p className="text-sm font-semibold text-ink-soft">{label}</p>
    </div>
  );
}
