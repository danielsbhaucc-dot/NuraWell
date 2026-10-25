import Link from 'next/link';
import type { ReactNode } from 'react';
import { ChevronLeft, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

/** iPhone-Settings-style grouped section: small gray caption, white rounded card, hairline dividers between rows. */
export function OpsGroup({ title, footer, children, className }: { title?: string; footer?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={className}>
      {title ? <h2 className="mb-1.5 px-4 text-[13px] font-medium text-ink-faint">{title}</h2> : null}
      <div className="overflow-hidden rounded-[1.25rem] bg-gc shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.04)] divide-y divide-forest-950/6">
        {children}
      </div>
      {footer ? <p className="mt-1.5 px-4 text-xs leading-relaxed text-ink-faint">{footer}</p> : null}
    </section>
  );
}

export type OpsTone = 'emerald' | 'violet' | 'sky' | 'amber' | 'rose' | 'cyan' | 'slate';
const ICON_BG: Record<OpsTone, string> = {
  emerald: 'bg-primary-500',
  violet: 'bg-iris-500',
  sky: 'bg-secondary-500',
  amber: 'bg-accent-500',
  rose: 'bg-coral-500',
  cyan: 'bg-secondary-500',
  slate: 'bg-ink-500',
};

/** One row: colored rounded-square icon, title + subtitle, chevron (points left in RTL). */
export function OpsRow({ href, icon: Icon, tone = 'emerald', title, desc, trailing }: { href: string; icon: LucideIcon; tone?: OpsTone; title: string; desc?: string; trailing?: ReactNode }) {
  return (
    <Link prefetch={false} href={href} className="flex min-h-14 items-center gap-3 px-4 py-2.5 transition-colors hover:bg-forest-950/3 active:bg-forest-950/5">
      <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-[0.6rem] text-gc', ICON_BG[tone])}>
        <Icon className="h-[18px] w-[18px]" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[16px] font-semibold text-ink">{title}</span>
        {desc ? <span className="block truncate text-[13px] text-ink-faint">{desc}</span> : null}
      </span>
      {trailing}
      <ChevronLeft className="h-4 w-4 shrink-0 text-ink-300" aria-hidden />
    </Link>
  );
}
