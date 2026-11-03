import Link from 'next/link';
import { LEGAL_NAV } from './legal-nav';

/**
 * שורת קישורים קומפקטית למסמכים המשפטיים (תנאי שימוש / פרטיות / בטיחות / נגישות).
 * מיועדת ל-footer של דפים פנימיים, התחברות והרשמה.
 */
export function LegalLinksRow({
  tone = 'light',
  className = '',
}: {
  tone?: 'light' | 'dark';
  className?: string;
}) {
  const linkClass =
    tone === 'dark'
      ? 'text-primary-100/80 hover:text-on-dark'
      : 'text-primary-700/80 hover:text-primary-800';

  // No separator glyphs: items are spaced by the flex gap only, so wrapping can
  // never leave a dot at the start or end of a line (R22).
  return (
    <nav
      aria-label="מסמכים משפטיים"
      className={`flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-xs font-semibold ${className}`}
    >
      {LEGAL_NAV.map((item) => (
        <Link key={item.href} href={item.href} className={`underline-offset-2 hover:underline transition-colors ${linkClass}`}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
