import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** Shared header + tabs: יומן פעילות | שגיאות. Soft gradient backdrop so the glass reads. */
export function LogsShell({ tab, children }: { tab: 'activity' | 'errors'; children: ReactNode }) {
  const t = (k: typeof tab, href: string, label: string) => (
    <Link prefetch={false} href={href} className={cn('flex-1 rounded-2xl px-4 py-2 text-center text-sm font-bold transition', tab === k ? 'bg-white text-slate-900 shadow dark:bg-white/90' : 'text-slate-600 dark:text-slate-300')}>{label}</Link>
  );
  return (
    <div dir="rtl" className="relative -m-2 flex flex-col gap-4 rounded-[2rem] bg-gradient-to-br from-sky-100/70 via-violet-100/60 to-emerald-100/60 p-3 sm:p-5 dark:from-slate-950 dark:via-indigo-950/60 dark:to-slate-900">
      <div className="pointer-events-none absolute -top-10 end-10 h-40 w-40 rounded-full bg-violet-400/30 blur-3xl" />
      <div className="pointer-events-none absolute bottom-10 start-0 h-40 w-40 rounded-full bg-sky-400/30 blur-3xl" />
      <h1 className="relative px-1 font-display text-[1.75rem] font-black leading-tight tracking-tight text-slate-900 dark:text-white">יומנים</h1>
      <nav className="relative flex gap-1 rounded-3xl bg-white/40 p-1 backdrop-blur-xl dark:bg-white/10">{t('activity', '/ops/errors?tab=activity', 'יומן פעילות')}{t('errors', '/ops/errors', 'שגיאות')}</nav>
      <div className="relative">{children}</div>
    </div>
  );
}
