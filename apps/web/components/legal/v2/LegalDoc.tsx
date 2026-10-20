import type { ReactNode } from 'react';
import { LegalToc } from './LegalToc';
import { LdChrome, LdQuote, type LdStat } from './LdChrome';

/**
 * Public legal document layout (C3 design system).
 * Visual tokens live in app/legal-v2.css under `.ld[data-theme=...]`.
 */
export type LegalDocSection = {
  id: string;
  title: string;
  /** "בקצרה" one-liner, always visible above the collapsible body. */
  short?: string;
  body: ReactNode;
  /** Expanded by default (e.g. the data table). */
  open?: boolean;
};

export type LegalSummaryCard = { title: string; text: string; icon?: ReactNode };

const TONES = ['em', 'amb', 'teal'] as const;

export function LegalDoc({
  eyebrow,
  title,
  titleAccent,
  lead,
  leadExtra,
  updatedAt,
  version,
  summary,
  sections,
  currentPath,
  stat,
  quote,
  quoteAfter,
}: {
  /** Kept for backwards compatibility; theme comes from LEGAL_THEME. */
  theme?: string;
  eyebrow: string;
  title: string;
  titleAccent?: string;
  lead: string;
  leadExtra?: ReactNode;
  updatedAt: string;
  version: string;
  summary: LegalSummaryCard[];
  sections: LegalDocSection[];
  currentPath: string;
  stat?: LdStat;
  /** Mid-page pull-quote: [text, gold accent]. */
  quote?: [string, string?];
  /** Index of the section after which the quote is placed. */
  quoteAfter?: number;
}) {
  const qAt = quote ? Math.min(quoteAfter ?? Math.floor(sections.length / 2) - 1, sections.length - 1) : -1;
  return (
    <LdChrome
      eyebrow={eyebrow}
      title={title}
      titleAccent={titleAccent}
      lead={lead}
      leadExtra={leadExtra}
      chips={[`עודכן ${updatedAt}`, `גרסה ${version}`]}
      stat={stat}
      currentPath={currentPath}
    >
      <LegalToc items={sections.map((s, i) => ({ id: s.id, num: String(i + 1), label: s.title }))} />

      <section aria-labelledby="ld-short" className="ld-block">
        <h2 id="ld-short" className="ld-h2">בקצרה</h2>
        <p className="ld-sub">הדברים החשובים ביותר, לפני הפירוט.</p>
        <ul className="ld-cards" data-count={summary.length}>
          {summary.map((c, i) => (
            <li key={c.title} className={`ld-card t-${TONES[i % 3]}`}>
              {c.icon ? <span className="ld-ib" aria-hidden>{c.icon}</span> : null}
              <span>
                <strong>{c.title}</strong>
                <span className="ld-card-txt">{c.text}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <main id="ld-main" className="ld-main">
        {sections.map((s, i) => (
          <div key={s.id}>
            <div className="ld-sep" aria-hidden />
            <section id={s.id} className="ld-sec" aria-labelledby={`${s.id}-h`}>
              <h2 id={`${s.id}-h`} className="ld-h2">
                <span className="ld-num">{i + 1}.</span>
                {s.title}
              </h2>
              {s.short ? <p className="ld-sub"><span className="ld-sr">בקצרה: </span>{s.short}</p> : null}
              <details className="ld-acc ld-glass" open={s.open}>
                <summary>
                  <span className="ld-acc-t">
                    <strong>{s.open ? 'הפירוט המלא' : 'לקריאת הסעיף המלא'}</strong>
                    <small>{s.title}</small>
                  </span>
                  <span className="ld-chev" aria-hidden>
                    <svg width="16" height="16" viewBox="0 0 16 16"><path d="M3 6l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                  </span>
                </summary>
                <div className="ld-acc-body ld-prose">{s.body}</div>
              </details>
            </section>
            {i === qAt && quote ? <LdQuote accent={quote[1]}>{quote[0]}</LdQuote> : null}
          </div>
        ))}
      </main>
    </LdChrome>
  );
}

/** Responsive data table: card-rows on desktop, labelled cards on mobile (pure CSS). */
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
            <tr key={ri} className={`t-${TONES[ri % 3]}`}>
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
