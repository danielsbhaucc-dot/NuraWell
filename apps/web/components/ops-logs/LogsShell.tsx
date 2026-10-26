import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** Shared header + tabs: יומן פעילות | שגיאות. Cream canvas with a subtle static colorful glow (CSS gradients only — no extra blur layers). */
export function LogsShell({ tab, children }: { tab: 'activity' | 'errors'; children: ReactNode }) {
  const t = (k: typeof tab, href: string, label: string) => (
    <Link prefetch={false} href={href} aria-current={tab === k ? 'page' : undefined}
      className={cn('rounded-[14px] px-4 py-1.5 text-[14px] font-medium transition', tab === k ? 'bg-gc text-ink-900 shadow-sm dark:bg-ink-700 dark:text-gc' : 'text-ink-500 hover:text-ink-800 dark:text-ink-500')}>{label}</Link>
  );
  return (
    <div dir="rtl" className="relative isolate mx-auto flex w-full max-w-3xl flex-col gap-8 overflow-hidden rounded-[32px] bg-cream-tint px-3 py-6 sm:px-6 dark:bg-transparent">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(40rem_22rem_at_90%_-5%,rgba(52,211,153,0.28),transparent_60%),radial-gradient(30rem_20rem_at_0%_30%,rgba(167,139,250,0.22),transparent_60%),radial-gradient(28rem_18rem_at_70%_100%,rgba(251,191,36,0.18),transparent_60%)] dark:opacity-40" />
      <header className="flex flex-col gap-4 px-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-[1.65rem] font-semibold tracking-tight text-ink-900 dark:text-gc">יומנים</h1>
          <p className="mt-1 text-[13px] text-ink-500">מה קרה במערכת, מה דורש תשומת לב.</p>
        </div>
        <nav className="inline-flex self-start rounded-2xl bg-cream-deep/60 p-0.5 dark:bg-gc/10">{t('activity', '/ops/errors?tab=activity', 'פעילות')}{t('errors', '/ops/errors', 'שגיאות')}</nav>
      </header>
      {children}
    </div>
  );
}
