import type { ReactNode } from 'react';

/** Numbered section with gold numbering and a separator above it (C3). */
export function LegalSection({
  id,
  num,
  title,
  children,
}: {
  id?: string;
  num: string | number;
  title: string;
  children: ReactNode;
}) {
  return (
    <>
      <div className="ld-sep" aria-hidden />
      <section id={id} className="ld-sec" data-num={String(num)}>
        <h2 className="ld-h2">
          <span className="ld-num">{num}.</span>
          {title}
        </h2>
        <div className="ld-panel ld-glass ld-prose">{children}</div>
      </section>
    </>
  );
}

/** Group wrapper (kept for API compatibility; layout handled by sections). */
export function LegalCard({ children }: { children: ReactNode }) {
  return <div className="ld-group">{children}</div>;
}

/** Highlighted callout — info / warn / danger. */
export function LegalCallout({
  tone = 'info',
  icon,
  children,
}: {
  tone?: 'info' | 'warn' | 'danger';
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={`ld-callout ld-callout--${tone}`} role={tone === 'danger' ? 'note' : undefined}>
      {icon ? <span className="ld-ib" aria-hidden>{icon}</span> : null}
      <div className="ld-callout-body">{children}</div>
    </div>
  );
}

export function LegalDataGrid({ children }: { children: ReactNode }) {
  return <div className="ld-cards ld-cards--grid">{children}</div>;
}

export function LegalDataItem({
  icon,
  title,
  what,
  why,
}: {
  icon?: ReactNode;
  title: string;
  what: ReactNode;
  why: ReactNode;
}) {
  return (
    <div className="ld-card t-em">
      {icon ? <span className="ld-ib" aria-hidden>{icon}</span> : null}
      <span>
        <strong>{title}</strong>
        <span className="ld-card-txt">{what}</span>
        <span className="ld-card-txt"><strong>למה זה נאסף: </strong>{why}</span>
      </span>
    </div>
  );
}
