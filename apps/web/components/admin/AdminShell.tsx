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
  UserCircle,
  X,
} from 'lucide-react';
import { cn } from '../../lib/cn';

type AdminShellProps = {
  children: React.ReactNode;
  /** שם פרטי מהפרופיל; אם ריק — מציגים רק שלום עם אימוג׳י */
  adminFirstName: string;
};

export function AdminShell({ children, adminFirstName }: AdminShellProps) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const isHome = pathname === '/admin';
  const isAlmogSettings = pathname === '/admin/almog';
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

  const greeting =
    adminFirstName.trim().length > 0 ? (
      <>
        שלום, {adminFirstName.trim()} <span aria-hidden>👋</span>
      </>
    ) : (
      <>
        שלום <span aria-hidden>👋</span>
      </>
    );

  return (
    <div
      className="min-h-[100dvh] bg-gradient-to-br from-slate-400/55 via-slate-300/65 to-slate-500/50 font-sans text-slate-900 touch-manipulation"
      dir="rtl"
    >
      {/* רקע דקורטיבי — קונטרסט עדין על גוון כהה יותר */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden>
        <div className="absolute -top-36 -right-36 h-80 w-80 rounded-full bg-emerald-500/25 blur-3xl sm:h-96 sm:w-96 sm:bg-emerald-400/30" />
        <div className="absolute top-32 -left-24 h-64 w-64 rounded-full bg-teal-600/20 blur-3xl sm:h-72 sm:w-72 sm:bg-teal-500/25" />
        <div className="absolute bottom-0 left-1/3 h-48 w-48 rounded-full bg-slate-900/10 blur-3xl" />
      </div>

      <aside
        className={cn(
          'fixed top-0 right-0 z-40 h-[100dvh] max-h-[100dvh] w-[min(18rem,calc(100vw-1rem))] sm:w-64 transition-transform duration-300 ease-in-out',
          sidebarOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0',
        )}
      >
        <div className="h-full overflow-y-auto overscroll-contain border-l border-white/25 bg-slate-950/35 px-3 py-5 shadow-[0_16px_48px_rgba(15,23,42,0.35)] backdrop-blur-2xl sm:px-4 sm:py-6">
          <div className="mb-8 flex items-center justify-between pl-1 sm:mb-10 sm:pl-2">
            <Link
              href="/admin"
              className="flex min-w-0 items-center gap-2.5 sm:gap-3"
              onClick={() => setSidebarOpen(false)}
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500 text-lg font-bold text-white shadow-lg shadow-emerald-900/40 sm:h-10 sm:w-10 sm:text-xl">
                N
              </div>
              <span className="bg-gradient-to-l from-emerald-300 to-teal-300 bg-clip-text text-xl font-black text-transparent sm:text-2xl">
                NuraAdmin
              </span>
            </Link>
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-slate-300 hover:bg-white/10 hover:text-white active:bg-white/15 lg:hidden"
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
                  ? 'border border-emerald-400/35 bg-white/15 font-bold text-emerald-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-md'
                  : 'text-slate-300 hover:bg-white/10 hover:text-white',
              )}
            >
              <LayoutDashboard size={20} className={isHome ? 'text-emerald-400' : ''} />
              <span>ראשי</span>
            </Link>

            <Link
              href="/admin/almog"
              onClick={() => setSidebarOpen(false)}
              className={cn(
                'flex min-h-11 w-full items-center gap-3 rounded-2xl px-4 py-3 text-[15px] transition-all duration-200 active:scale-[0.99] sm:text-base',
                isAlmogSettings
                  ? 'border border-emerald-400/35 bg-white/15 font-bold text-emerald-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-md'
                  : 'text-slate-300 hover:bg-white/10 hover:text-white',
              )}
            >
              <UserCircle size={20} className={isAlmogSettings ? 'text-emerald-400' : ''} />
              <span>הגדרות אלמוג</span>
            </Link>

            <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md">
              <button
                type="button"
                onClick={() => setJourneySettingsOpen((o) => !o)}
                className={cn(
                  'flex min-h-11 w-full items-center justify-between gap-2 rounded-2xl px-4 py-3 text-right text-[15px] transition-all duration-200 active:scale-[0.99] sm:text-base',
                  isJourneyManage && !isHome && !isAlmogSettings
                    ? 'bg-white/10 font-semibold text-emerald-200'
                    : 'text-slate-300 hover:bg-white/10 hover:text-white',
                )}
                aria-expanded={journeySettingsOpen}
              >
                <span className="flex items-center gap-3">
                  <Map size={20} className={isJourneyManage ? 'text-emerald-400' : ''} />
                  הגדרות מסע
                </span>
                <ChevronDown
                  size={18}
                  className={cn('shrink-0 text-slate-400 transition-transform', journeySettingsOpen && '-rotate-180')}
                />
              </button>

              {journeySettingsOpen && (
                <ul className="mr-2 mt-1 space-y-1 border-r border-emerald-500/35 pr-3 pb-2">
                  <li>
                    <Link
                      href="/admin/journey"
                      onClick={() => setSidebarOpen(false)}
                      className={cn(
                        'flex min-h-11 items-center gap-2 rounded-xl px-3 py-2.5 text-sm transition-colors active:bg-emerald-500/25 sm:text-[15px]',
                        isJourneyManage
                          ? 'bg-emerald-500/25 font-bold text-emerald-100'
                          : 'text-slate-300 hover:bg-white/10 hover:text-white',
                      )}
                    >
                      <ListTree size={17} className="shrink-0 opacity-90" />
                      ניהול
                    </Link>
                  </li>
                </ul>
              )}
            </div>
          </nav>

          <div className="mt-10 border-t border-white/15 pt-6">
            <Link
              href="/courses"
              className="flex min-h-11 items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold text-slate-400 transition-colors hover:bg-white/10 hover:text-slate-100 active:bg-white/15"
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
          className="fixed inset-0 z-30 touch-none bg-slate-950/50 backdrop-blur-[3px] lg:hidden"
          aria-label="סגור תפריט"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <main className="relative z-10 flex min-h-[100dvh] flex-col pb-[env(safe-area-inset-bottom)] lg:pr-64">
        <header className="safe-area-top sticky top-0 z-20 flex min-h-[3.25rem] items-center justify-between gap-2 border-b border-white/20 bg-slate-950/25 px-3 py-2.5 shadow-[0_8px_32px_rgba(15,23,42,0.2)] backdrop-blur-2xl sm:min-h-14 sm:gap-3 sm:px-4 sm:py-3">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3 lg:hidden">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 p-0 text-slate-100 shadow-inner backdrop-blur-md active:bg-white/25"
              aria-label="פתח תפריט"
            >
              <Menu size={22} />
            </button>
            <span className="truncate text-[15px] font-bold text-slate-100 sm:text-base">פאנל ניהול</span>
          </div>

          <div className="flex min-h-11 min-w-0 flex-1 items-center justify-end">
            <p className="truncate text-right text-[13px] font-semibold tracking-tight text-slate-100 sm:text-sm md:text-base">
              {greeting}
            </p>
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
