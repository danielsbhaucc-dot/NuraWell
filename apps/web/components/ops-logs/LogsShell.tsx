import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** Shared header + tabs: יומן פעילות | שגיאות. Calm cream canvas, no decorative blobs. */
export function LogsShell({ tab, children }: { tab: 'activity' | 'errors'; children: ReactNode }) {
  const t = (k: typeof tab, href: string, label: string) => (
    <Link prefetch={false} href={href} aria-current={tab === k ? 'page' : undefined}
      className={cn('rounded-[10px] px-4 py-1.5 text-[14px] font-medium transition', tab === k ? 'bg-cream text-slate-900 shadow-sm dark:bg-slate-700 dark:text-cream' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400')}>{label}</Link>
  );
  return (
    <div dir="rtl" className="mx-auto flex w-full max-w-3xl flex-col gap-8 rounded-3xl bg-cream-tint/60 px-3 py-6 sm:px-6 dark:bg-transparent">
      <header className="flex flex-col gap-4 px-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-[1.65rem] font-semibold tracking-tight text-slate-900 dark:text-cream">יומנים</h1>
          <p className="mt-1 text-[13px] text-slate-500">מה קרה במערכת, מה דורש תשומת לב.</p>
        </div>
        <nav className="inline-flex self-start rounded-xl bg-black/[0.05] p-0.5 dark:bg-cream/10">{t('activity', '/ops/errors?tab=activity', 'פעילות')}{t('errors', '/ops/errors', 'שגיאות')}</nav>
      </header>
      {children}
    </div>
  );
}
