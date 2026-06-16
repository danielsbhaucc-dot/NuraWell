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
      ? 'text-emerald-100/80 hover:text-white'
      : 'text-emerald-700/80 hover:text-emerald-800';
  const dotClass = tone === 'dark' ? 'text-emerald-100/40' : 'text-emerald-700/30';

  return (
    <nav
      aria-label="מסמכים משפטיים"
      className={`flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs font-semibold ${className}`}
    >
      {LEGAL_NAV.map((item, i) => (
        <span key={item.href} className="inline-flex items-center gap-2">
          {i > 0 ? <span className={dotClass} aria-hidden>·</span> : null}
          <Link href={item.href} className={`underline-offset-2 hover:underline transition-colors ${linkClass}`}>
            {item.label}
          </Link>
        </span>
      ))}
    </nav>
  );
}
