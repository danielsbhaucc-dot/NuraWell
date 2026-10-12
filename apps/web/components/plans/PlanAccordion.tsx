import type { ReactNode } from 'react';

/** Collapsed-by-default accordion for the dense plan sections (native <details>: no JS, no scroll traps). */
export function PlanAccordion({ id, icon, title, meta, children, open = false }: { id?: string; icon: string; title: string; meta?: string; children: ReactNode; open?: boolean }) {
  return (
    <details id={id} open={open} className="group rounded-[22px] border border-primary-100/90 bg-background-card/80 shadow-[0_6px_20px_rgba(6,78,59,0.05)] backdrop-blur-sm open:bg-background-card">
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-lg" aria-hidden>
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-bold text-primary-900">{title}</span>
          {meta ? <span className="block text-xs text-primary-800/65">{meta}</span> : null}
        </span>
        <svg aria-hidden viewBox="0 0 20 20" className="size-5 shrink-0 text-primary-700 transition-transform group-open:rotate-180">
          <path d="M5 8l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </summary>
      <div className="flex flex-col gap-3 border-t border-primary-100/80 px-4 pb-4 pt-3">{children}</div>
    </details>
  );
}
