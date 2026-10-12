import type { ReactNode } from 'react';

/** Numbered plan-document section: calm header, content stacked under a thin mint rail. */
export function PlanSection({ n, id, title, hint, children }: { n: number; id: string; title: string; hint?: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary-100 text-xs font-black text-brand-700" aria-hidden>
          {n}
        </span>
        <div className="min-w-0">
          <h2 id={id} className="text-lg font-bold text-primary-900">
            {title}
          </h2>
          {hint ? <p className="text-xs text-primary-800/70">{hint}</p> : null}
        </div>
      </div>
      <div className="flex flex-col gap-3 border-s-2 border-primary-100 ps-3">{children}</div>
    </section>
  );
}
