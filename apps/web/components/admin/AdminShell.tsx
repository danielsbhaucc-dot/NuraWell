'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ChevronDown,
  LayoutDashboard,
  ListTree,
  Map,
  Menu,
  Sparkles,
  X,
} from 'lucide-react';
import { cn } from '../../lib/cn';

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const isHome = pathname === '/admin';
  const isJourneyManage =
    pathname === '/admin/journey' || pathname.startsWith('/admin/steps');

  const [journeySettingsOpen, setJourneySettingsOpen] = useState(isJourneyManage);

  useEffect(() => {
    if (isJourneyManage) setJourneySettingsOpen(true);
  }, [isJourneyManage]);

  useEffect(() => {
    if (!sidebarOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [sidebarOpen]);

  return (
    <div className="min-h-[100dvh] bg-slate-50 text-slate-800 font-sans touch-manipulation" dir="rtl">
      {/* רקע דקורטיבי: רק מסכים רחבים (במובייל פחות blur — יציבות וביצועים) */}
      <div className="pointer-events-none fixed inset-0 z-0 hidden overflow-hidden sm:block" aria-hidden>
        <div className="absolute -top-40 -right-40 h-96 w-96 animate-pulse rounded-full bg-emerald-200/50 opacity-40 mix-blend-multiply blur-3xl" />
        <div className="absolute top-40 -left-20 h-72 w-72 rounded-full bg-teal-200/50 opacity-40 mix-blend-multiply blur-3xl" />
      </div>

      <aside
        className={cn(
          'fixed top-0 right-0 z-40 h-[100dvh] max-h-[100dvh] w-[min(18rem,calc(100vw-1rem))] sm:w-64 transition-transform duration-300 ease-in-out',
          sidebarOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0',
        )}
      >
        <div className="h-full overflow-y-auto overscroll-contain border-l border-white/50 bg-white/70 px-3 py-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-xl sm:px-4 sm:py-6">
          <div className="mb-8 flex items-center justify-between pl-1 sm:mb-10 sm:pl-2">
            <Link
              href="/admin"
              className="flex min-w-0 items-center gap-2.5 sm:gap-3"
              onClick={() => setSidebarOpen(false)}
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500 text-lg font-bold text-white shadow-lg shadow-emerald-200 sm:h-10 sm:w-10 sm:text-xl">
                N
              </div>
              <span className="bg-gradient-to-l from-emerald-600 to-teal-500 bg-clip-text text-xl font-black text-transparent sm:text-2xl">
                NuraAdmin
              </span>
            </Link>
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-slate-500 hover:bg-white/60 hover:text-slate-800 active:bg-white/80 lg:hidden"
              aria-label="סגור תפריט"
            >
              <X size={24} />
            </button>
          </div>

          <nav className="space-y-2" aria-label="ניווט פאנל ניהול">
            <Link
              href="/admin"
              onClick={() => setSidebarOpen(false)}
              className={cn(
                'flex min-h-11 w-full items-center gap-3 rounded-2xl px-4 py-3 text-[15px] transition-all duration-200 active:scale-[0.99] sm:text-base',
                isHome
                  ? 'border border-white bg-white font-bold text-emerald-600 shadow-sm'
                  : 'text-slate-500 hover:bg-white/50 hover:text-slate-800',
              )}
            >
              <LayoutDashboard size={20} className={isHome ? 'text-emerald-500' : ''} />
              <span>ראשי</span>
            </Link>

            <div className="rounded-2xl border border-transparent">
              <button
                type="button"
                onClick={() => setJourneySettingsOpen((o) => !o)}
                className={cn(
                  'flex min-h-11 w-full items-center justify-between gap-2 rounded-2xl px-4 py-3 text-right text-[15px] transition-all duration-200 active:scale-[0.99] sm:text-base',
                  isJourneyManage && !isHome
                    ? 'bg-white/80 font-semibold text-emerald-700 shadow-sm'
                    : 'text-slate-500 hover:bg-white/50 hover:text-slate-800',
                )}
                aria-expanded={journeySettingsOpen}
              >
                <span className="flex items-center gap-3">
                  <Map size={20} className={isJourneyManage ? 'text-emerald-500' : ''} />
                  הגדרות מסע
                </span>
                <ChevronDown
                  size={18}
                  className={cn('shrink-0 text-slate-400 transition-transform', journeySettingsOpen && '-rotate-180')}
                />
              </button>

              {journeySettingsOpen && (
                <ul className="mr-2 mt-1 space-y-1 border-r border-emerald-100/80 pr-3">
                  <li>
                    <Link
                      href="/admin/journey"
                      onClick={() => setSidebarOpen(false)}
                      className={cn(
                        'flex min-h-11 items-center gap-2 rounded-xl px-3 py-2.5 text-sm transition-colors active:bg-emerald-100/50 sm:text-[15px]',
                        isJourneyManage
                          ? 'bg-emerald-50 font-bold text-emerald-700'
                          : 'text-slate-600 hover:bg-white/60 hover:text-slate-900',
                      )}
                    >
                      <ListTree size={17} className="shrink-0 opacity-80" />
                      ניהול
                    </Link>
                  </li>
                </ul>
              )}
            </div>
          </nav>

          <div className="mt-10 border-t border-slate-200/80 pt-6">
            <Link
              href="/courses"
              className="flex min-h-11 items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold text-slate-500 transition-colors hover:bg-white/60 hover:text-slate-800 active:bg-white/80"
              onClick={() => setSidebarOpen(false)}
            >
              <ArrowLeft size={18} className="shrink-0" />
              חזרה לאפליקציה
            </Link>
          </div>
        </div>
      </aside>

      {sidebarOpen && (
        <button
          type="button"
          className="fixed inset-0 z-30 touch-none bg-slate-900/25 backdrop-blur-[2px] lg:hidden"
          aria-label="סגור תפריט"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <main className="relative z-10 flex min-h-[100dvh] flex-col pb-[env(safe-area-inset-bottom)] lg:pr-64">
        <header className="safe-area-top sticky top-0 z-20 flex min-h-[3.25rem] items-center justify-between gap-2 border-b border-white/40 bg-white/70 px-3 py-2.5 shadow-sm backdrop-blur-lg sm:min-h-14 sm:gap-3 sm:px-4 sm:py-3">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3 lg:hidden">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl border border-slate-100 bg-white p-0 text-slate-700 shadow-sm active:bg-slate-50"
              aria-label="פתח תפריט"
            >
              <Menu size={22} />
            </button>
            <span className="truncate text-[15px] font-bold text-slate-800 sm:text-base">פאנל ניהול</span>
          </div>

          <div className="flex min-h-11 flex-1 items-center justify-end gap-2 sm:gap-3">
            <span className="hidden text-sm font-medium text-slate-600 md:inline">מצב מנהל</span>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-emerald-500/80 bg-gradient-to-br from-emerald-50 to-teal-50 p-0.5 shadow-inner">
              <Sparkles className="h-5 w-5 text-emerald-600" aria-hidden />
            </div>
          </div>
        </header>

        <div
          id="main-content"
          className="mx-auto w-full max-w-5xl flex-1 space-y-6 px-3 py-5 sm:space-y-8 sm:px-4 sm:py-6 md:px-6 md:py-8 safe-area-bottom"
        >
          {children}
        </div>
      </main>
    </div>
  );
}
