import type { ReactNode } from 'react';
import '@/app/legal-v2.css';
import { LdChrome } from './v2/LdChrome';

/**
 * Public info pages (about, contact, safety, accessibility) on the C3 design system.
 * `subtitle` is the lead; an optional `titleAccent` renders as the gold second line.
 */
export function LegalShell({
  icon: _icon,
  title,
  titleAccent,
  subtitle,
  updatedAt,
  currentPath,
  children,
}: {
  icon?: ReactNode;
  title: string;
  titleAccent?: string;
  subtitle: string;
  updatedAt: string;
  currentPath: string;
  children: ReactNode;
}) {
  return (
    <LdChrome
      eyebrow={title}
      title={title}
      titleAccent={titleAccent}
      lead={subtitle}
      chips={[`עודכן ${updatedAt}`]}
      currentPath={currentPath}
    >
      <main id="ld-main" className="ld-main ld-main--shell">{children}</main>
    </LdChrome>
  );
}
