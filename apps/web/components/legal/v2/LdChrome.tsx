import type { ReactNode } from 'react';
import Link from 'next/link';
import { LEGAL_NAV } from '../legal-nav';
import { HeroArt } from './HeroArt';
import { PrintExpand } from './PrintExpand';
import { LEGAL_THEME } from './theme';

export type LdStat = { big: string; label: string; text?: string };

/** Shared C3 chrome for all public/legal pages: top bar, bento hero, footer. */
export function LdChrome({
  eyebrow,
  title,
  titleAccent,
  lead,
  leadExtra,
  chips,
  stat,
  currentPath,
  children,
}: {
  eyebrow: string;
  title: string;
  titleAccent?: string;
  lead: string;
  leadExtra?: ReactNode;
  chips?: string[];
  stat?: LdStat;
  currentPath: string;
  children: ReactNode;
}) {
  return (
    <div className="ld public-dark" data-theme={LEGAL_THEME} dir="rtl" lang="he">
      <PrintExpand />
      <a href="#ld-main" className="ld-skip">דילוג לתוכן</a>
      <header className="ld-top ld-glass">
        <Link href="/" className="ld-brand" aria-label="NuraWell — לעמוד הבית">
          <span className="ld-brand-mark" aria-hidden />
          <span className="ld-brand-txt">NuraWell</span>
        </Link>
        <nav aria-label="עמודי מידע" className="ld-docs">
          {LEGAL_NAV.map((n) => (
            <Link key={n.href} href={n.href} aria-current={n.href === currentPath ? 'page' : undefined}>
              {n.label}
            </Link>
          ))}
        </nav>
      </header>

      <div className={`ld-heroGrid${stat ? '' : ' ld-heroGrid--solo'}`}>
        <div className="ld-hero">
          <div className="ld-hero-txt">
            <p className="ld-pill">{eyebrow}</p>
            <h1 className="ld-title">
              {title}
              {titleAccent ? (<><br /><span className="ld-shine">{titleAccent}</span></>) : null}
            </h1>
            <p className="ld-lead">{lead}</p>
            {leadExtra}
            {chips?.length ? (
              <ul className="ld-chips">{chips.map((c) => <li key={c}>{c}</li>)}</ul>
            ) : null}
          </div>
          <HeroArt className="ld-art" />
        </div>
        {stat ? (
          <aside className="ld-stat" aria-label={`${stat.big} ${stat.label}`}>
            <span className="ld-stat-big" aria-hidden>{stat.big}</span>
            <span>
              <strong>{stat.label}</strong>
              {stat.text ? <small>{stat.text}</small> : null}
            </span>
          </aside>
        ) : null}
      </div>

      {children}

      <footer className="ld-foot">
        <div className="ld-sep" aria-hidden />
        <nav aria-label="קישורים בתחתית" className="ld-foot-links">
          {LEGAL_NAV.map((n) => <Link key={n.href} href={n.href}>{n.label}</Link>)}
        </nav>
        <p>© {new Date().getFullYear()} NuraWell · כל הזכויות שמורות</p>
      </footer>
    </div>
  );
}

/** Mid-page highlighted pull-quote. */
export function LdQuote({ children, accent }: { children: ReactNode; accent?: string }) {
  return (
    <figure className="ld-quote-wrap">
      <blockquote className="ld-quote ld-glass">
        {children}
        {accent ? <> <span className="ld-shine">{accent}</span></> : null}
      </blockquote>
    </figure>
  );
}
