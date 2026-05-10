'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Bell,
  ChevronDown,
  Globe,
  LayoutDashboard,
  BookOpen,
  Layers,
  ListTree,
  Map,
  Menu,
  PanelRightClose,
  PanelRightOpen,
  Sparkles,
  UserCircle,
  X,
} from 'lucide-react';
import { cn } from '../../lib/cn';
import { OpsSessionGuard } from './OpsSessionGuard';

const SIDEBAR_COLLAPSED_KEY = 'nura-admin-sidebar-collapsed';

type AdminShellProps = {
  children: React.ReactNode;
  /** שם פרטי מהפרופיל; אם ריק — מציגים רק שלום עם אימוג׳י */
  adminFirstName: string;
  /** שם מלא לכותרת */
  adminDisplayName?: string;
  /** תמונת פרופיל (אופציונלי) */
  adminAvatarUrl?: string | null;
  /** כתובת האתר הציבורי (ללא סלאש סיום) — ממסד / env */
  mainAppBase: string;
};

/** תואם גם rewrite מ־ops.example.com/journey וגם גישה ישירה ל־/ops/journey בפיתוח */
function normalizeOpsPathname(pathname: string): string {
  const p = pathname.endsWith('/') && pathname.length > 1 ? pathname.slice(0, -1) : pathname;
  if (p.startsWith('/ops')) return p;
  if (p === '/' || p === '') return '/ops';
  return `/ops${p}`;
}

export function AdminShell({
  children,
  adminFirstName,
  adminDisplayName = 'מנהל',
  adminAvatarUrl = null,
  mainAppBase,
}: AdminShellProps) {
  const pathname = usePathname();
  const np = normalizeOpsPathname(pathname);
  const coursesHref = mainAppBase ? `${mainAppBase}/courses` : '/courses';
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarCollapseReady, setSidebarCollapseReady] = useState(false);

  const isHome = np === '/ops';
  const isAlmogSettings = np === '/ops/almog';
  const isSiteSettings = np === '/ops/site-settings';
  const isSystemRagIngest = np === '/ops/system-rag-ingest';
  const isAlmogNavSection = isAlmogSettings || isSystemRagIngest;
  const isJourneyHub = np === '/ops/journey-hub';
  const isJourneyManage =
    np.startsWith('/ops/journey') || np.startsWith('/ops/steps') || isJourneyHub;

  const [journeySettingsOpen, setJourneySettingsOpen] = useState(isJourneyManage);
  const [almogNavOpen, setAlmogNavOpen] = useState(isAlmogNavSection);

  useEffect(() => {
    if (isJourneyManage) setJourneySettingsOpen(true);
  }, [isJourneyManage]);

  useEffect(() => {
    if (isAlmogNavSection) setAlmogNavOpen(true);
  }, [isAlmogNavSection]);

  useEffect(() => {
    try {
      setSidebarCollapsed(localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1');
    } catch {
      /* ignore */
    }
    setSidebarCollapseReady(true);
  }, []);

  useEffect(() => {
    if (!sidebarCollapseReady) return;
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, sidebarCollapsed ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [sidebarCollapsed, sidebarCollapseReady]);

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

  const showNavLabels = !sidebarCollapsed;
  const mainPadLg = sidebarCollapsed ? 'lg:pr-[4.75rem]' : 'lg:pr-64';

  const navBtn = (active: boolean, color: 'emerald' | 'violet' | 'sky' | 'amber') =>
    cn(
      'flex min-h-11 w-full items-center gap-3 rounded-2xl px-3 py-3 text-[15px] transition-all duration-200 active:scale-[0.99] sm:text-base',
      showNavLabels ? 'px-4' : 'justify-center px-2',
      active
        ? {
            emerald:
              'border border-emerald-400/50 bg-emerald-500/15 font-bold text-emerald-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] backdrop-blur-md',
            violet:
              'border border-violet-400/45 bg-violet-500/15 font-bold text-violet-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] backdrop-blur-md',
            sky: 'border border-sky-400/45 bg-sky-500/15 font-bold text-sky-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] backdrop-blur-md',
            amber:
              'border border-amber-400/50 bg-amber-400/15 font-bold text-amber-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] backdrop-blur-md',
          }[color]
        : 'text-slate-600 hover:bg-white/55 hover:text-slate-900',
    );

  const bottomNavClass = (active: boolean) =>
    cn(
      'flex min-h-[3.25rem] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl px-1 py-2 text-[10px] font-semibold transition-colors sm:text-[11px]',
      active ? 'text-emerald-800' : 'text-slate-500',
    );

  return (
    <div
      className="min-h-[100dvh] bg-gradient-to-br from-emerald-50 via-cyan-50/80 to-violet-100/90 font-sans text-slate-900 touch-manipulation"
      dir="rtl"
    >
      <OpsSessionGuard />
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden>
        <div className="absolute -top-28 -right-20 h-[22rem] w-[22rem] rounded-full bg-gradient-to-br from-emerald-400/45 to-teal-400/35 blur-3xl" />
        <div className="absolute top-1/4 -left-16 h-72 w-72 rounded-full bg-gradient-to-tr from-fuchsia-400/35 to-violet-400/30 blur-3xl" />
        <div className="absolute bottom-10 right-1/3 h-56 w-56 rounded-full bg-gradient-to-tl from-amber-300/40 to-orange-300/30 blur-3xl" />
        <div className="absolute bottom-0 left-0 h-64 w-64 rounded-full bg-gradient-to-tr from-sky-400/30 to-cyan-300/25 blur-3xl" />
      </div>

      <aside
        className={cn(
          'fixed top-0 right-0 z-40 h-[100dvh] max-h-[100dvh] transition-[transform,width] duration-300 ease-in-out',
          'w-[min(18.5rem,calc(100vw-1.25rem))]',
          sidebarCollapsed ? 'lg:w-[4.75rem]' : 'lg:w-64',
          sidebarOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0',
        )}
      >
        <div
          className={cn(
            'flex h-full min-h-0 flex-col overscroll-contain border-l border-white/70 bg-white/50 px-3 py-5 shadow-[0_20px_56px_rgba(99,102,241,0.14)] backdrop-blur-2xl sm:px-4 sm:py-6',
            sidebarCollapsed && 'lg:px-2 lg:py-5',
          )}
        >
          <div
            className={cn(
              'mb-6 flex items-center justify-between gap-2 sm:mb-8',
              sidebarCollapsed && 'lg:mb-6 lg:flex-col lg:gap-3',
            )}
          >
            <Link
              href="/"
              className={cn(
                'flex min-w-0 items-center gap-2.5 sm:gap-3',
                sidebarCollapsed && 'lg:w-full lg:justify-center',
              )}
              onClick={() => setSidebarOpen(false)}
              title="NuraAdmin"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-lg font-black text-white shadow-lg shadow-emerald-600/35">
                N
              </div>
              <span
                className={cn(
                  'bg-gradient-to-l from-emerald-600 via-teal-600 to-cyan-700 bg-clip-text font-display text-xl font-black text-transparent sm:text-2xl',
                  sidebarCollapsed && 'lg:hidden',
                )}
              >
                NuraAdmin
              </span>
            </Link>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => setSidebarCollapsed((c) => !c)}
                className="hidden min-h-10 min-w-10 items-center justify-center rounded-xl border border-white/50 bg-white/40 text-slate-700 shadow-sm backdrop-blur-md transition-colors hover:bg-white/70 lg:inline-flex"
                aria-expanded={!sidebarCollapsed}
                aria-label={sidebarCollapsed ? 'הרחב תפריט צד' : 'כווץ תפריט צד'}
                title={sidebarCollapsed ? 'הרחב תפריט' : 'כווץ תפריט'}
              >
                {sidebarCollapsed ? <PanelRightOpen size={20} /> : <PanelRightClose size={20} />}
              </button>
              <button
                type="button"
                onClick={() => setSidebarOpen(false)}
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-slate-600 hover:bg-white/60 active:bg-white/80 lg:hidden"
                aria-label="סגור תפריט"
              >
                <X size={24} />
              </button>
            </div>
          </div>

          <nav className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-0.5" aria-label="ניווט פאנל ניהול">
            <Link
              href="/"
              onClick={() => setSidebarOpen(false)}
              className={navBtn(isHome, 'emerald')}
              title="ראשי"
            >
              <LayoutDashboard size={20} className={cn('shrink-0', isHome && 'text-emerald-600')} />
              <span className={cn('truncate', !showNavLabels && 'lg:sr-only')}>ראשי</span>
              {isHome && showNavLabels && (
                <span className="mr-auto hidden h-2 w-2 rounded-full bg-emerald-500 lg:inline-block" aria-hidden />
              )}
            </Link>

            {sidebarCollapsed ? (
              <Link
                href="/almog"
                onClick={() => setSidebarOpen(false)}
                className={navBtn(isAlmogNavSection, 'violet')}
                title="אלמוג — הגדרות ואימון"
              >
                <Sparkles size={20} className={cn('shrink-0', isAlmogNavSection && 'text-violet-600')} />
                <span className={cn('truncate', !showNavLabels && 'lg:sr-only')}>אלמוג</span>
              </Link>
            ) : (
              <div className="rounded-2xl border border-white/50 bg-white/35 backdrop-blur-md">
                <button
                  type="button"
                  onClick={() => setAlmogNavOpen((o) => !o)}
                  className={cn(
                    'flex min-h-11 w-full items-center justify-between gap-2 rounded-2xl px-4 py-3 text-right text-[15px] transition-all duration-200 active:scale-[0.99] sm:text-base',
                    isAlmogNavSection && !isHome && !isJourneyManage
                      ? 'bg-violet-500/15 font-semibold text-violet-950'
                      : 'text-slate-600 hover:bg-white/50 hover:text-slate-900',
                  )}
                  aria-expanded={almogNavOpen}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <Sparkles size={20} className={cn('shrink-0', isAlmogNavSection && 'text-violet-600')} />
                    <span className="truncate">אלמוג</span>
                  </span>
                  <ChevronDown
                    size={18}
                    className={cn('shrink-0 text-slate-400 transition-transform', almogNavOpen && '-rotate-180')}
                  />
                </button>

                {almogNavOpen && (
                  <ul className="mr-2 mt-1 space-y-1 border-r border-violet-400/35 pr-3 pb-2">
                    <li>
                      <Link
                        href="/almog"
                        onClick={() => setSidebarOpen(false)}
                        className={cn(
                          'flex min-h-11 items-center gap-2 rounded-xl px-3 py-2.5 text-sm transition-colors active:bg-violet-400/20 sm:text-[15px]',
                          isAlmogSettings
                            ? 'bg-violet-400/20 font-bold text-violet-950'
                            : 'text-slate-600 hover:bg-white/50 hover:text-slate-900',
                        )}
                      >
                        <UserCircle size={17} className="shrink-0 opacity-90" />
                        הגדרות אלמוג
                      </Link>
                    </li>
                    <li>
                      <Link
                        href="/system-rag-ingest"
                        onClick={() => setSidebarOpen(false)}
                        className={cn(
                          'flex min-h-11 items-center gap-2 rounded-xl px-3 py-2.5 text-sm transition-colors active:bg-violet-400/20 sm:text-[15px]',
                          isSystemRagIngest
                            ? 'bg-violet-400/20 font-bold text-violet-950'
                            : 'text-slate-600 hover:bg-white/50 hover:text-slate-900',
                        )}
                      >
                        <BookOpen size={17} className="shrink-0 opacity-90" />
                        לאמן את אלמוג
                      </Link>
                    </li>
                  </ul>
                )}
              </div>
            )}

            {sidebarCollapsed ? (
              <Link
                href="/journey"
                onClick={() => setSidebarOpen(false)}
                className={navBtn(isJourneyManage, 'amber')}
                title="הגדרות מסע — ניהול"
              >
                <Map size={20} className={cn('shrink-0', isJourneyManage && 'text-amber-600')} />
                <span className="lg:sr-only">הגדרות מסע</span>
              </Link>
            ) : (
              <div className="rounded-2xl border border-white/50 bg-white/35 backdrop-blur-md">
                <button
                  type="button"
                  onClick={() => setJourneySettingsOpen((o) => !o)}
                  className={cn(
                    'flex min-h-11 w-full items-center justify-between gap-2 rounded-2xl px-4 py-3 text-right text-[15px] transition-all duration-200 active:scale-[0.99] sm:text-base',
                    isJourneyManage && !isHome && !isAlmogNavSection
                      ? 'bg-amber-400/20 font-semibold text-amber-950'
                      : 'text-slate-600 hover:bg-white/50 hover:text-slate-900',
                  )}
                  aria-expanded={journeySettingsOpen}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <Map size={20} className={cn('shrink-0', isJourneyManage && 'text-amber-600')} />
                    <span className="truncate">הגדרות מסע</span>
                  </span>
                  <ChevronDown
                    size={18}
                    className={cn('shrink-0 text-slate-400 transition-transform', journeySettingsOpen && '-rotate-180')}
                  />
                </button>

                {journeySettingsOpen && (
                  <ul className="mr-2 mt-1 space-y-1 border-r border-amber-400/40 pr-3 pb-2">
                    <li>
                      <Link
                        href="/journey-hub"
                        onClick={() => setSidebarOpen(false)}
                        className={cn(
                          'flex min-h-11 items-center gap-2 rounded-xl px-3 py-2.5 text-sm transition-colors active:bg-amber-400/25 sm:text-[15px]',
                          isJourneyHub
                            ? 'bg-amber-400/25 font-bold text-amber-950'
                            : 'text-slate-600 hover:bg-white/50 hover:text-slate-900',
                        )}
                      >
                        <Layers size={17} className="shrink-0 opacity-90" />
                        מסע ותחנות
                      </Link>
                    </li>
                    <li>
                      <Link
                        href="/journey"
                        onClick={() => setSidebarOpen(false)}
                        className={cn(
                          'flex min-h-11 items-center gap-2 rounded-xl px-3 py-2.5 text-sm transition-colors active:bg-amber-400/25 sm:text-[15px]',
                          (np === '/ops/journey' || np.startsWith('/ops/steps')) && !isJourneyHub
                            ? 'bg-amber-400/25 font-bold text-amber-950'
                            : 'text-slate-600 hover:bg-white/50 hover:text-slate-900',
                        )}
                      >
                        <ListTree size={17} className="shrink-0 opacity-90" />
                        רשימת צעדים
                      </Link>
                    </li>
                  </ul>
                )}
              </div>
            )}
          </nav>

          <div className={cn('shrink-0 space-y-2 border-t border-white/45 pt-5', sidebarCollapsed && 'lg:pt-4')}>
            <Link
              href="/site-settings"
              onClick={() => setSidebarOpen(false)}
              className={cn(
                navBtn(isSiteSettings, 'sky'),
                'border border-white/40 bg-white/30 shadow-sm',
              )}
              title="הגדרות אתר"
            >
              <Globe size={20} className={cn('shrink-0', isSiteSettings && 'text-sky-600')} />
              <span className={cn('truncate', !showNavLabels && 'lg:sr-only')}>הגדרות אתר</span>
            </Link>
            <Link
              href={coursesHref}
              className={cn(
                'flex min-h-11 items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold text-slate-500 transition-colors hover:bg-white/55 hover:text-slate-800 active:bg-white/70',
                sidebarCollapsed && 'lg:justify-center lg:px-2',
              )}
              onClick={() => setSidebarOpen(false)}
              title="חזרה לאפליקציה"
            >
              <ArrowLeft size={18} className="shrink-0" />
              <span className={cn(!showNavLabels && 'lg:sr-only')}>חזרה לאפליקציה</span>
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

      <main
        className={cn(
          'relative z-10 flex min-h-[100dvh] flex-col pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-[env(safe-area-inset-bottom)]',
          mainPadLg,
        )}
      >
        <header className="safe-area-top sticky top-0 z-20 border-b border-white/50 bg-gradient-to-l from-emerald-200/95 via-teal-100/90 to-cyan-100/85 shadow-[0_8px_28px_rgba(16,185,129,0.15)] backdrop-blur-xl">
          <div className="header-grid-pattern opacity-50" aria-hidden />
          <div className="relative flex min-h-[3.5rem] items-center gap-2 px-3 py-2.5 sm:min-h-14 sm:gap-3 sm:px-4 sm:py-3">
            <div className="flex shrink-0 items-center gap-2 sm:gap-2.5 lg:hidden">
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-2xl border border-white/60 bg-white/50 text-slate-800 shadow-sm backdrop-blur-md active:scale-[0.98]"
                aria-label="פתח תפריט"
              >
                <Menu size={22} />
              </button>
            </div>

            <p className="min-w-0 flex-1 truncate text-right font-display text-[13px] font-bold tracking-tight text-emerald-950 sm:text-sm md:text-base">
              {greeting}
            </p>

            <div className="flex shrink-0 items-center gap-2 sm:gap-3">
              <span className="hidden max-w-[12rem] truncate text-left text-sm font-semibold text-emerald-900/90 md:inline">
                {adminDisplayName}
              </span>
              <button
                type="button"
                className="relative inline-flex min-h-10 min-w-10 items-center justify-center rounded-2xl border border-white/55 bg-white/45 text-emerald-900 shadow-sm backdrop-blur-md transition-colors hover:bg-white/70"
                aria-label="התראות (בקרוב)"
              >
                <Bell size={20} className="opacity-90" />
              </button>
              <div
                className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full border-2 border-white/80 bg-gradient-to-br from-violet-200 to-emerald-200 shadow-md ring-2 ring-white/90"
                title={adminDisplayName}
              >
                {adminAvatarUrl && adminAvatarUrl.startsWith('http') ? (
                  <Image
                    src={adminAvatarUrl}
                    alt={adminDisplayName}
                    fill
                    className="object-cover"
                    sizes="40px"
                    unoptimized
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center font-display text-sm font-bold text-emerald-900">
                    {adminDisplayName.charAt(0)}
                  </span>
                )}
              </div>
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

      <nav
        className="fixed bottom-0 left-0 right-0 z-30 flex border-t border-white/55 bg-white/55 px-2 py-2 shadow-[0_-8px_32px_rgba(99,102,241,0.12)] backdrop-blur-2xl safe-area-bottom lg:hidden"
        aria-label="ניווט מהיר"
      >
        <Link href="/" onClick={() => setSidebarOpen(false)} className={bottomNavClass(isHome)}>
          <LayoutDashboard className={cn('h-5 w-5', isHome ? 'text-emerald-600' : '')} />
          ראשי
        </Link>
        <Link href="/almog" onClick={() => setSidebarOpen(false)} className={bottomNavClass(isAlmogSettings)}>
          <UserCircle className={cn('h-5 w-5', isAlmogSettings ? 'text-violet-600' : '')} />
          אלמוג
        </Link>
        <Link href="/site-settings" onClick={() => setSidebarOpen(false)} className={bottomNavClass(isSiteSettings)}>
          <Globe className={cn('h-5 w-5', isSiteSettings ? 'text-sky-600' : '')} />
          אתר
        </Link>
        <Link href="/journey" onClick={() => setSidebarOpen(false)} className={bottomNavClass(isJourneyManage)}>
          <Map className={cn('h-5 w-5', isJourneyManage ? 'text-amber-600' : '')} />
          מסע
        </Link>
      </nav>
    </div>
  );
}
