import type { ReactNode } from 'react';

/** כותרת סעיף ממוספרת בעיצוב זכוכית. */
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
    <section id={id} className="legal-section">
      <div className="legal-section-head">
        <span className="legal-section-num" aria-hidden>
          {num}
        </span>
        <h2 className="legal-section-title">{title}</h2>
      </div>
      <div className="legal-prose">{children}</div>
    </section>
  );
}

/** כרטיס זכוכית עוטף (ניתן לקבץ כמה סעיפים יחד). */
export function LegalCard({ children }: { children: ReactNode }) {
  return <div className="legal-card">{children}</div>;
}

/** קולאאוט מודגש — ניטרלי / אזהרה / קריטי. */
export function LegalCallout({
  tone = 'info',
  icon,
  children,
}: {
  tone?: 'info' | 'warn' | 'danger';
  icon?: ReactNode;
  children: ReactNode;
}) {
  const toneClass = tone === 'warn' ? 'warn' : tone === 'danger' ? 'danger' : '';
  return (
    <div className={`legal-callout ${toneClass}`}>
      {icon ? (
        <span className="legal-callout-icon" aria-hidden>
          {icon}
        </span>
      ) : null}
      <div className="legal-callout-body">{children}</div>
    </div>
  );
}

/** רשת פריטי נתונים (למדיניות פרטיות — מה נאסף + למה). */
export function LegalDataGrid({ children }: { children: ReactNode }) {
  return <div className="legal-data-grid">{children}</div>;
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
    <div className="legal-data-item">
      <h4>
        {icon ? <span aria-hidden>{icon}</span> : null}
        {title}
      </h4>
      <p>{what}</p>
      <span className="legal-data-why">
        <strong>למה זה נאסף: </strong>
        {why}
      </span>
    </div>
  );
}
