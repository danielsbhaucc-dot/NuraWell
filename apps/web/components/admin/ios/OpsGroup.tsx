import Link from 'next/link';
import type { ReactNode } from 'react';
import { ChevronLeft, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

/** iPhone-Settings-style grouped section: small gray caption, white rounded card, hairline dividers between rows. */
export function OpsGroup({ title, footer, children, className }: { title?: string; footer?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={className}>
      {title ? <h2 className="mb-1.5 px-4 text-[13px] font-medium text-slate-500">{title}</h2> : null}
      <div className="overflow-hidden rounded-[1.25rem] bg-cream shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.04)] divide-y divide-black/6">
        {children}
      </div>
      {footer ? <p className="mt-1.5 px-4 text-xs leading-relaxed text-slate-500">{footer}</p> : null}
    </section>
  );
}

export type OpsTone = 'emerald' | 'violet' | 'sky' | 'amber' | 'rose' | 'cyan' | 'slate';
const ICON_BG: Record<OpsTone, string> = {
  emerald: 'bg-emerald-500',
  violet: 'bg-violet-500',
  sky: 'bg-sky-500',
  amber: 'bg-amber-500',
  rose: 'bg-rose-500',
  cyan: 'bg-cyan-500',
  slate: 'bg-slate-500',
};

/** One row: colored rounded-square icon, title + subtitle, chevron (points left in RTL). */
export function OpsRow({ href, icon: Icon, tone = 'emerald', title, desc, trailing }: { href: string; icon: LucideIcon; tone?: OpsTone; title: string; desc?: string; trailing?: ReactNode }) {
  return (
    <Link prefetch={false} href={href} className="flex min-h-14 items-center gap-3 px-4 py-2.5 transition-colors hover:bg-black/3 active:bg-black/5">
      <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-[0.6rem] text-cream', ICON_BG[tone])}>
        <Icon className="h-[18px] w-[18px]" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[16px] font-semibold text-slate-900">{title}</span>
        {desc ? <span className="block truncate text-[13px] text-slate-500">{desc}</span> : null}
      </span>
      {trailing}
      <ChevronLeft className="h-4 w-4 shrink-0 text-slate-300" aria-hidden />
    </Link>
  );
}
