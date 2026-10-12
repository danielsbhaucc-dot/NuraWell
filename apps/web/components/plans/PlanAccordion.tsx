import type { ReactNode } from 'react';

/** Collapsed-by-default disclosure for dense plan content (route, reminders, history, fallback steps). Native <details>, no JS. */
export function PlanAccordion({ title, meta, children, tone = 'card' }: { title: string; meta?: string; children: ReactNode; tone?: 'card' | 'inline' }) {
  return (
    <details className={`group ${tone === 'card' ? 'rounded-3xl border border-primary-100/80 bg-background-card/80 shadow-[0_6px_20px_rgba(6,78,59,0.05)]' : 'rounded-2xl bg-primary-50/50'}`}>
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-bold text-primary-900">{title}</span>
          {meta ? <span className="block text-[11px] text-primary-800/65">{meta}</span> : null}
        </span>
        <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary-100/80 text-brand-700 transition-transform duration-200 group-open:rotate-180">
          <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m5 8 5 5 5-5" /></svg>
        </span>
      </summary>
      <div className="flex flex-col gap-2.5 px-4 pb-4">{children}</div>
    </details>
  );
}
