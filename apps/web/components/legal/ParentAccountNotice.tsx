import Link from 'next/link';
import { Building2 } from 'lucide-react';

/**
 * Transparency notice (owner decision t1252s5335): the sign-in account is managed by the parent company and shared
 * across its products; NuraWell's own data stays separate. Shown in privacy settings and in the profile.
 * Not used on the login / signup screens (their look is frozen).
 */
export function ParentAccountNotice({ className = '' }: { className?: string }) {
  return (
    <aside
      aria-label="על החשבון המרכזי"
      data-testid="parent-account-notice"
      className={`flex items-start gap-3 rounded-2xl border border-primary-100 bg-primary-50/60 p-4 text-sm leading-relaxed text-ink-soft ${className}`}
    >
      <Building2 className="mt-0.5 size-4 shrink-0 text-primary-700" aria-hidden />
      <p>
        החשבון מנוהל בחשבון המרכזי של חברת האם, ואותו חשבון משמש לכניסה לכל המוצרים שלה. הנתונים של{' '}
        <bdi className="font-semibold text-ink">NuraWell</bdi> נשמרים בנפרד ולא עוברים למוצרים האחרים.{' '}
        <Link href="/privacy#who" className="font-semibold text-primary-700 underline">
          פרטים במדיניות הפרטיות
        </Link>
      </p>
    </aside>
  );
}
