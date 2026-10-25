import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

/**
 * כפתור חזרה אחיד לכל האתר — חץ ימינה + תווית, גלולת זכוכית, תמיד בתחילת השורה (ימין ב-RTL).
 * variant="onDark" לכותרות ירוקות/תמונות, "onLight" לרקע בהיר.
 */
export function PageBackButton({
  href,
  onClick,
  label = 'חזרה',
  ariaLabel,
  variant = 'onDark',
  className = '',
}: {
  href?: string;
  onClick?: () => void;
  label?: string;
  ariaLabel?: string;
  variant?: 'onDark' | 'onLight';
  className?: string;
}) {
  const tone =
    variant === 'onDark'
      ? 'bg-on-dark/15 text-on-dark ring-on-dark/25 hover:bg-on-dark/25'
      : 'bg-glass/85 backdrop-blur-md text-primary-900 ring-primary-900/10 hover:bg-glass shadow-[0_1px_3px_rgba(4,47,36,0.08)]';
  const cls = `inline-flex h-9 shrink-0 items-center gap-1 rounded-full ps-2 pe-3.5 text-xs font-bold ring-1 backdrop-blur-md transition active:scale-95 ${tone} ${className}`;
  const content = (
    <>
      <ChevronRight className="h-4 w-4" strokeWidth={2.4} aria-hidden />
      {label}
    </>
  );
  if (href) {
    return (
      <Link href={href} aria-label={ariaLabel ?? label} className={cls}>
        {content}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} aria-label={ariaLabel ?? label} className={cls}>
      {content}
    </button>
  );
}
