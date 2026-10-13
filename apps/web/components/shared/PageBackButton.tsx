import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

/**
 * כפתור חזרה אחיד לכל האתר — תמיד בצד ימין (תחילת השורה ב-RTL), זכוכית עדינה.
 * variant="onDark" לכותרות ירוקות, "onLight" לרקע בהיר.
 */
export function PageBackButton({
  href,
  label = 'חזרה',
  variant = 'onDark',
}: {
  href: string;
  label?: string;
  variant?: 'onDark' | 'onLight';
}) {
  const tone =
    variant === 'onDark'
      ? 'bg-white/15 text-white ring-white/25 hover:bg-white/25'
      : 'bg-white/80 text-emerald-900 ring-emerald-900/10 hover:bg-white shadow-[0_1px_3px_rgba(4,47,36,0.08)]';
  return (
    <Link
      href={href}
      aria-label={label}
      className={`inline-flex h-9 items-center gap-1 rounded-full ps-2 pe-3.5 text-xs font-bold ring-1 backdrop-blur-md transition active:scale-95 ${tone}`}
    >
      <ChevronRight className="h-4 w-4" strokeWidth={2.4} aria-hidden />
      {label}
    </Link>
  );
}
