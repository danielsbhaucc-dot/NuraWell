import type { ReactNode } from 'react';
import Link from 'next/link';
import { LEGAL_NAV } from '../legal-nav';
import { LegalToc } from './LegalToc';

/**
 * Theme-agnostic legal document layout (v2).
 * All visuals come from CSS custom properties under `.ld[data-theme=...]`
 * (see app/legal-v2.css). Swap the theme by changing `theme` only.
 */
export type LegalDocSection = {
  id: string;
  title: string;
  /** "בקצרה" one-liner shown above the section body. */
  short?: string;
  body: ReactNode;
};

export type LegalSummaryCard = { title: string; text: string; icon?: ReactNode };

export function LegalDoc({
  theme = 'editorial-gold',
  eyebrow,
  title,
  lead,
  updatedAt,
  version,
  summary,
  sections,
  currentPath,
}: {
  theme?: string;
  eyebrow: string;
  title: string;
  lead: string;
  updatedAt: string;
  version: string;
  summary: LegalSummaryCard[];
  sections: LegalDocSection[];
  currentPath: string;
}) {
  return (
    <div className="ld" data-theme={theme} dir="rtl" lang="he">
      <a href="#ld-main" className="ld-skip">דילוג לתוכן</a>
      <header className="ld-top">
        <Link href="/" className="ld-brand">NuraWell</Link>
        <nav aria-label="מסמכים משפטיים" className="ld-docs">
          {LEGAL_NAV.map((n) => (
            <Link key={n.href} href={n.href} aria-current={n.href === currentPath ? 'page' : undefined}>
              {n.label}
            </Link>
          ))}
        </nav>
      </header>

      <div className="ld-hero">
        <p className="ld-eyebrow">{eyebrow}</p>
        <h1 className="ld-title">{title}</h1>
        <p className="ld-lead">{lead}</p>
        <p className="ld-meta">
          עודכן: <time>{updatedAt}</time> · גרסה {version}
        </p>
      </div>

      <section aria-labelledby="ld-short" className="ld-summary">
        <h2 id="ld-short" className="ld-summary-h">בקצרה</h2>
        <ul className="ld-cards">
          {summary.map((c) => (
            <li key={c.title} className="ld-card">
              {c.icon ? <span className="ld-card-icon" aria-hidden>{c.icon}</span> : null}
              <strong>{c.title}</strong>
              <span>{c.text}</span>
            </li>
          ))}
        </ul>
      </section>

      <div className="ld-body">
        <LegalToc items={sections.map((s, i) => ({ id: s.id, label: `${i + 1}. ${s.title}` }))} />
        <main id="ld-main" className="ld-main">
          {sections.map((s, i) => (
            <section key={s.id} id={s.id} className="ld-sec" aria-labelledby={`${s.id}-h`}>
              <h2 id={`${s.id}-h`} className="ld-sec-h">
                <span className="ld-num" aria-hidden>{String(i + 1).padStart(2, '0')}</span>
                {s.title}
              </h2>
              {s.short ? (
                <p className="ld-short"><strong>בקצרה: </strong>{s.short}</p>
              ) : null}
              <div className="ld-prose">{s.body}</div>
            </section>
          ))}
        </main>
      </div>

      <footer className="ld-foot">
        <p>© {new Date().getFullYear()} NuraWell</p>
      </footer>
    </div>
  );
}

/** Responsive data table: real <table> on wide screens, labelled cards on mobile (pure CSS). */
export function LegalDataTable({
  caption,
  columns,
  rows,
}: {
  caption: string;
  columns: string[];
  rows: ReactNode[][];
}) {
  return (
    <div className="ld-table-wrap" role="region" aria-label={caption} tabIndex={0}>
      <table className="ld-table">
        <caption className="ld-sr">{caption}</caption>
        <thead>
          <tr>{columns.map((c) => <th key={c} scope="col">{c}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri}>
              {r.map((cell, ci) =>
                ci === 0 ? (
                  <th key={ci} scope="row" data-label={columns[ci]}>{cell}</th>
                ) : (
                  <td key={ci} data-label={columns[ci]}>{cell}</td>
                )
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
