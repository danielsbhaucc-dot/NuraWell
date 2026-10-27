'use client';

import { ProductSwitcher } from './ProductSwitcher';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createContext, useContext, useEffect, useState, type ComponentProps } from 'react';
import {
  Accessibility,
  ArrowLeft,
  ChevronDown,
  DollarSign,
  TrendingUp,
  AlertTriangle,
  FlaskConical,
  Globe,
  LayoutDashboard,
  BookOpen,
  Layers,
  ListTree,
  Map,
  Menu,
  Music,
  PanelRightClose,
  PanelRightOpen,
  Sparkles,
  Trophy,
  UserCircle,
  X,
  Bot,
  ShieldCheck, Scale, Boxes } from 'lucide-react';
import { cn } from '../../lib/cn';
import { OpsSessionGuard } from './OpsSessionGuard';
import { AdminAiAssistantCard } from './AdminAiAssistantCard';
import { AdminNotificationsBell } from './AdminNotificationsBell';
import { MediaManagerProvider } from '@/components/media-manager/MediaManagerProvider';
import { AdminMediaManagerLauncher } from '@/components/media-manager/AdminMediaManagerLauncher';

const SIDEBAR_COLLAPSED_KEY = 'nura-admin-sidebar-collapsed';

/** Menu entries of modules that are off for this product are not rendered (pages stay gated server-side). */
const HiddenNav = createContext<readonly string[]>([]);
function NavLink(props: ComponentProps<typeof Link>) {
  const hidden = useContext(HiddenNav);
  const href = typeof props.href === 'string' ? props.href : '';
  if (href && hidden.some((p) => href === p || href.startsWith(`${p}/`))) return null;
  return <Link {...props} />;
}

type AdminShellProps = {
  /** Pages of modules that are off for the selected product (their menu entries are hidden). */
  hiddenPaths?: readonly string[];
  /** Admin-only notice: our own product's license/billing needs attention (modules stay on). */
  licenseAlert?: boolean;
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
  hiddenPaths = [],
  licenseAlert = false,
}: AdminShellProps) {
  const pathname = usePathname();
  const np = normalizeOpsPathname(pathname);
  const opsHref = (path: string) => {
    const suffix = path.startsWith('/') ? path : `/${path}`;
    return pathname.startsWith('/ops') ? `/ops${suffix}` : suffix;
  };
  const homeHref = pathname.startsWith('/ops') ? '/ops' : '/';
  const coursesHref = mainAppBase ? `${mainAppBase}/home` : '/home';
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarCollapseReady, setSidebarCollapseReady] = useState(false);

  const isHome = np === '/ops';
  const isUsers = np === '/ops/users' || np.startsWith('/ops/users/');
  const isCosts = np === '/ops/costs';
  const isNotifyQuality = np === '/ops/notify-quality';
  const isAlmogSettings = np === '/ops/almog' || np === '/ops/mentors';
  const isSiteSettings = np === '/ops/site-settings';
  const isAccessibility = np === '/ops/accessibility';
  const isPrivacy = np === '/ops/privacy';
  const isLegal = np === '/ops/legal';
  const isSystemRagIngest = np === '/ops/system-rag-ingest';
  const isAlmogNavSection = isAlmogSettings || isSystemRagIngest;
  const isJourneyHub = np === '/ops/journey' || np === '/ops/journey-hub' || np.startsWith('/ops/steps');
  const isAudio = np === '/ops/audio' || np.startsWith('/ops/audio/');
  const isGuides = np === '/ops/guides' || np.startsWith('/ops/guides/');
  const isChallenge = np === '/ops/challenge' || np.startsWith('/ops/challenge/');
  const isDemoAccess = np === '/ops/demo-access' || np.startsWith('/ops/demo-access/');
  const isJourneyManage =
    np.startsWith('/ops/journey') || np.startsWith('/ops/steps') || isJourneyHub || isAudio;

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

  const greetingName = adminFirstName.trim();
  // Same on server (UTC) and client — avoids a hydration mismatch (React #418) on every Ops page.
  const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Asia/Jerusalem' }).format(new Date()));
  const dayPart = hour < 12 ? 'בוקר טוב' : hour < 17 ? 'צהריים טובים' : hour < 21 ? 'ערב טוב' : 'לילה טוב';

  const showNavLabels = !sidebarCollapsed;
  const mainPadLg = sidebarCollapsed ? 'lg:pr-19' : 'lg:pr-64';

  const navBtn = (active: boolean, color: 'emerald' | 'violet' | 'sky' | 'amber') =>
    cn(
      'flex min-h-11 w-full items-center gap-3 rounded-2xl px-3 py-3 text-[15px] transition-all duration-200 active:scale-[0.99] sm:text-base',
      showNavLabels ? 'px-4' : 'justify-center px-2',
      active
        ? {
            emerald:
              'bg-primary-500/12 font-bold text-primary-900',
            violet:
              'bg-iris-500/12 font-bold text-iris-900',
            sky: 'bg-secondary-500/12 font-bold text-secondary-950',
            amber:
              'bg-accent-400/15 font-bold text-accent-950',
          }[color]
        : 'text-ink-soft hover:bg-forest-950/4 hover:text-ink',
    );

  const bottomNavClass = (active: boolean) =>
    cn(
      'flex min-h-13 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl px-1 py-2 text-[10px] font-semibold transition-colors sm:text-[11px]',
      active ? 'text-primary-800' : 'text-ink-faint',
    );

  return (
    <HiddenNav.Provider value={hiddenPaths}>
    <MediaManagerProvider>
    <div
      className="min-h-dvh bg-gc-canvas font-sans text-ink antialiased touch-manipulation"
      dir="rtl"
    >
      <OpsSessionGuard />

      <aside
        className={cn(
          'fixed top-0 inset-s-0 z-40 h-dvh max-h-dvh transition-[transform,width] duration-300 ease-in-out',
          'w-[min(18.5rem,calc(100vw-1.25rem))]',
          sidebarCollapsed ? 'lg:w-19' : 'lg:w-64',
          sidebarOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0',
        )}
      >
        <div
          className={cn(
            'flex h-full min-h-0 flex-col overscroll-contain border-e border-forest-950/5 bg-gc/95 px-3 py-5 shadow-[0_0_24px_rgba(0,0,0,0.04)] backdrop-blur-xl sm:px-4 sm:py-6',
            sidebarCollapsed && 'lg:px-2 lg:py-5',
          )}
        >
          <div
            className={cn(
              'mb-6 flex items-center justify-between gap-2 sm:mb-8',
              sidebarCollapsed && 'lg:mb-6 lg:flex-col lg:gap-3',
            )}
          >
            <Link prefetch={false}
              href="/"
              className={cn(
                'flex min-w-0 items-center gap-2.5 sm:gap-3',
                sidebarCollapsed && 'lg:w-full lg:justify-center',
              )}
              onClick={() => setSidebarOpen(false)}
              title="NuraAdmin"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-linear-to-br from-primary-500 to-secondary-600 text-lg font-black text-gc shadow-lg shadow-primary-600/35">
                N
              </div>
              <span
                className={cn(
                  'min-w-0 truncate font-display text-xl font-black tracking-tight text-ink',
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
                className="hidden min-h-10 min-w-10 items-center justify-center rounded-xl border border-gc/50 bg-background-card/40 text-ink-soft shadow-xs backdrop-blur-md transition-colors hover:bg-background-card/70 lg:inline-flex"
                aria-expanded={!sidebarCollapsed}
                aria-label={sidebarCollapsed ? 'הרחב תפריט צד' : 'כווץ תפריט צד'}
                title={sidebarCollapsed ? 'הרחב תפריט' : 'כווץ תפריט'}
              >
                {sidebarCollapsed ? <PanelRightOpen size={20} /> : <PanelRightClose size={20} />}
              </button>
              <button
                type="button"
                onClick={() => setSidebarOpen(false)}
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-ink-soft hover:bg-background-card/60 active:bg-background-card/80 lg:hidden"
                aria-label="סגור תפריט"
              >
                <X size={24} />
              </button>
            </div>
          </div>

          <nav className="min-h-0 flex-1 space-y-2 overflow-y-auto ps-0.5" aria-label="ניווט פאנל ניהול">
            <Link prefetch={false}
              href={homeHref}
              onClick={() => setSidebarOpen(false)}
              className={navBtn(isHome, 'emerald')}
              title="ראשי"
            >
              <LayoutDashboard size={20} className={cn('shrink-0', isHome && 'text-primary-600')} />
              <span className={cn('truncate', !showNavLabels && 'lg:sr-only')}>ראשי</span>
              {isHome && showNavLabels && (
                <span className="ms-auto hidden h-2 w-2 rounded-full bg-primary-500 lg:inline-block" aria-hidden />
              )}
            </Link>

            <NavLink prefetch={false}
              href={opsHref('/users')}
              onClick={() => setSidebarOpen(false)}
              className={navBtn(isUsers, 'emerald')}
              title="משתמשים"
            >
              <UserCircle size={20} className={cn('shrink-0', isUsers && 'text-primary-600')} />
              <span className={cn('truncate', !showNavLabels && 'lg:sr-only')}>משתמשים</span>
            </NavLink>

            <NavLink prefetch={false}
              href={opsHref('/costs')}
              onClick={() => setSidebarOpen(false)}
              className={navBtn(isCosts, 'emerald')}
              title="עלויות"
            >
              <DollarSign size={20} className={cn('shrink-0', isCosts && 'text-primary-600')} />
              <span className={cn('truncate', !showNavLabels && 'lg:sr-only')}>עלויות</span>
            </NavLink>

            <NavLink prefetch={false}
              href={opsHref('/products')}
              onClick={() => setSidebarOpen(false)}
              className={navBtn(np === '/ops/products', 'emerald')}
              title="כל המוצרים"
            >
              <Boxes size={20} className={cn('shrink-0', np === '/ops/products' && 'text-emerald-600')} />
              <span className={cn('truncate', !showNavLabels && 'lg:sr-only')}>כל המוצרים</span>
            </NavLink>

            <NavLink prefetch={false}
              href={opsHref('/qc')}
              onClick={() => setSidebarOpen(false)}
              className={navBtn(np === '/ops/qc', 'emerald')}
              title="בקרת איכות"
            >
              <ShieldCheck size={20} className={cn('shrink-0', np === '/ops/qc' && 'text-emerald-600')} />
              <span className={cn('truncate', !showNavLabels && 'lg:sr-only')}>בקרת איכות</span>
            </NavLink>

            <NavLink prefetch={false}
              href={opsHref('/notify-quality')}
              onClick={() => setSidebarOpen(false)}
              className={navBtn(isNotifyQuality, 'emerald')}
              title="איכות התראות"
            >
              <Sparkles size={20} className={cn('shrink-0', isNotifyQuality && 'text-primary-600')} />
              <span className={cn('truncate', !showNavLabels && 'lg:sr-only')}>איכות התראות</span>
            </NavLink>

            <NavLink prefetch={false}
              href={opsHref('/business')}
              onClick={() => setSidebarOpen(false)}
              className={navBtn(np === '/ops/business', 'emerald')}
              title="מדדים עסקיים"
            >
              <TrendingUp size={20} className={cn('shrink-0', np === '/ops/business' && 'text-primary-600')} />
              <span className={cn('truncate', !showNavLabels && 'lg:sr-only')}>מדדים עסקיים</span>
            </NavLink>

            <NavLink prefetch={false}
              href={opsHref('/ceo')}
              onClick={() => setSidebarOpen(false)}
              className={navBtn(np === '/ops/ceo', 'emerald')}
              title="מנכ״ל AI"
            >
              <Bot size={20} className={cn('shrink-0', np === '/ops/ceo' && 'text-primary-600')} />
              <span className={cn('truncate', !showNavLabels && 'lg:sr-only')}>מנכ״ל AI</span>
            </NavLink>

            <NavLink prefetch={false}
              href={opsHref('/errors')}
              onClick={() => setSidebarOpen(false)}
              className={navBtn(np === '/ops/errors', 'emerald')}
              title="יומנים"
            >
              <AlertTriangle size={20} className={cn('shrink-0', np === '/ops/errors' && 'text-primary-600')} />
              <span className={cn('truncate', !showNavLabels && 'lg:sr-only')}>יומנים ושגיאות</span>
            </NavLink>

            <NavLink prefetch={false}
              href={opsHref('/guides')}
              onClick={() => setSidebarOpen(false)}
              className={navBtn(isGuides, 'emerald')}
              title="מדריכים"
            >
              <BookOpen size={20} className={cn('shrink-0', isGuides && 'text-primary-600')} />
              <span className={cn('truncate', !showNavLabels && 'lg:sr-only')}>מדריכים</span>
            </NavLink>

            <NavLink prefetch={false}
              href={opsHref('/challenge')}
              onClick={() => setSidebarOpen(false)}
              className={navBtn(isChallenge, 'violet')}
              title="אתגר 14 יום"
            >
              <Trophy size={20} className={cn('shrink-0', isChallenge && 'text-iris-600')} />
              <span className={cn('truncate', !showNavLabels && 'lg:sr-only')}>אתגר</span>
            </NavLink>

            <NavLink prefetch={false}
              href={opsHref('/demo-access')}
              onClick={() => setSidebarOpen(false)}
              className={navBtn(isDemoAccess, 'amber')}
              title="קישורי דמו"
            >
              <FlaskConical size={20} className={cn('shrink-0', isDemoAccess && 'text-accent-600')} />
              <span className={cn('truncate', !showNavLabels && 'lg:sr-only')}>קישורי דמו</span>
            </NavLink>

            {sidebarCollapsed ? (
              <NavLink prefetch={false}
                href={opsHref('/mentors')}
                onClick={() => setSidebarOpen(false)}
                className={navBtn(isAlmogNavSection, 'violet')}
                title="אלמוג — הגדרות ואימון"
              >
                <Sparkles size={20} className={cn('shrink-0', isAlmogNavSection && 'text-iris-600')} />
                <span className={cn('truncate', !showNavLabels && 'lg:sr-only')}>אלמוג</span>
              </NavLink>
            ) : (
              <div className="rounded-2xl border border-gc/50 bg-background-card/35 backdrop-blur-md">
                <button
                  type="button"
                  onClick={() => setAlmogNavOpen((o) => !o)}
                  className={cn(
                    'flex min-h-11 w-full items-center justify-between gap-2 rounded-2xl px-4 py-3 text-start text-[15px] transition-all duration-200 active:scale-[0.99] sm:text-base',
                    isAlmogNavSection && !isHome && !isJourneyManage
                      ? 'bg-iris-500/15 font-semibold text-iris-950'
                      : 'text-ink-soft hover:bg-background-card/50 hover:text-ink',
                  )}
                  aria-expanded={almogNavOpen}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <Sparkles size={20} className={cn('shrink-0', isAlmogNavSection && 'text-iris-600')} />
                    <span className="truncate">אלמוג</span>
                  </span>
                  <ChevronDown
                    size={18}
                    className={cn('shrink-0 text-ink-faint transition-transform', almogNavOpen && '-rotate-180')}
                  />
                </button>

                {almogNavOpen && (
                  <ul className="ms-2 mt-1 space-y-1 border-s border-iris-400/35 ps-3 pb-2">
                    <li>
                      <NavLink prefetch={false}
                        href={opsHref('/mentors')}
                        onClick={() => setSidebarOpen(false)}
                        className={cn(
                          'flex min-h-11 items-center gap-2 rounded-xl px-3 py-2.5 text-sm transition-colors active:bg-iris-400/20 sm:text-[15px]',
                          isAlmogSettings
                            ? 'bg-iris-400/20 font-bold text-iris-950'
                            : 'text-ink-soft hover:bg-background-card/50 hover:text-ink',
                        )}
                      >
                        <UserCircle size={17} className="shrink-0 opacity-90" />
                        הגדרות מנטורים
                      </NavLink>
                    </li>
                                        <li>
                      <NavLink prefetch={false}
                        href={opsHref('/journey')}
                        onClick={() => setSidebarOpen(false)}
                        className={cn(
                          'flex min-h-11 items-center gap-2 rounded-xl px-3 py-2.5 text-sm transition-colors active:bg-accent-400/25 sm:text-[15px]',
                          (np === '/ops/journey' || np.startsWith('/ops/steps')) && !isJourneyHub
                            ? 'bg-accent-400/25 font-bold text-accent-950'
                            : 'text-ink-soft hover:bg-background-card/50 hover:text-ink',
                        )}
                      >
                        <ListTree size={17} className="shrink-0 opacity-90" />
                        רשימת צעדים
                      </NavLink>
                    </li>
                    <li>
                      <NavLink prefetch={false}
                        href={opsHref('/audio')}
                        onClick={() => setSidebarOpen(false)}
                        className={cn(
                          'flex min-h-11 items-center gap-2 rounded-xl px-3 py-2.5 text-sm transition-colors active:bg-accent-400/25 sm:text-[15px]',
                          isAudio
                            ? 'bg-accent-400/25 font-bold text-accent-950'
                            : 'text-ink-soft hover:bg-background-card/50 hover:text-ink',
                        )}
                      >
                        <Music size={17} className="shrink-0 opacity-90" />
                        מוזיקת רקע
                      </NavLink>
                    </li>
                  </ul>
                )}
              </div>
            )}
          </nav>

          <div className={cn('shrink-0 space-y-2 border-t border-gc/45 pt-5', sidebarCollapsed && 'lg:pt-4')}>
            <AdminMediaManagerLauncher
              className={navBtn(false, 'emerald')}
              label="ספריית מדיה"
              iconSize={20}
              labelClassName={cn('truncate', !showNavLabels && 'lg:sr-only')}
            />
            <NavLink prefetch={false}
              href={opsHref('/site-settings')}
              onClick={() => setSidebarOpen(false)}
              className={cn(
                navBtn(isSiteSettings, 'sky'),
                'border border-gc/40 bg-background-card/30 shadow-xs',
              )}
              title="הגדרות אתר"
            >
              <Globe size={20} className={cn('shrink-0', isSiteSettings && 'text-secondary-600')} />
              <span className={cn('truncate', !showNavLabels && 'lg:sr-only')}>הגדרות אתר</span>
            </NavLink>
            <NavLink prefetch={false}
              href={opsHref('/accessibility')}
              onClick={() => setSidebarOpen(false)}
              className={cn(
                navBtn(isAccessibility, 'emerald'),
                'border border-gc/40 bg-background-card/30 shadow-xs',
              )}
              title="כלי נגישות"
            >
              <Accessibility size={20} className={cn('shrink-0', isAccessibility && 'text-primary-600')} />
              <span className={cn('truncate', !showNavLabels && 'lg:sr-only')}>נגישות</span>
            </NavLink>
            <NavLink prefetch={false}
              href={opsHref('/privacy')}
              onClick={() => setSidebarOpen(false)}
              className={cn(
                navBtn(isPrivacy, 'emerald'),
                'border border-gc/40 bg-background-card/30 shadow-xs',
              )}
              title="פרטיות"
            >
              <ShieldCheck size={20} className={cn('shrink-0', isPrivacy && 'text-primary-600')} />
              <span className={cn('truncate', !showNavLabels && 'lg:sr-only')}>פרטיות</span>
            </NavLink>
            <NavLink prefetch={false}
              href={opsHref('/legal')}
              onClick={() => setSidebarOpen(false)}
              className={cn(
                navBtn(isLegal, 'emerald'),
                'border border-gc/40 bg-background-card/30 shadow-xs',
              )}
              title="משפטי"
            >
              <Scale size={20} className={cn('shrink-0', isLegal && 'text-primary-600')} />
              <span className={cn('truncate', !showNavLabels && 'lg:sr-only')}>משפטי</span>
            </NavLink>
            <Link prefetch={false}
              href={coursesHref}
              className={cn(
                'flex min-h-11 items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold text-ink-faint transition-colors hover:bg-background-card/55 hover:text-ink active:bg-background-card/70',
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
          className="fixed inset-0 z-30 touch-none bg-ink-900/25 backdrop-blur-xs lg:hidden"
          aria-label="סגור תפריט"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <main
        className={cn(
          'relative z-10 flex min-h-dvh flex-col pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-safe-bottom',
          mainPadLg,
        )}
      >
        <header className="safe-area-top sticky top-0 z-20 border-b border-forest-950/5 bg-gc-canvas/85 backdrop-blur-xl">
          <div className="relative flex min-h-15 items-center gap-2.5 px-3 py-2.5 sm:min-h-16 sm:gap-3 sm:px-4 sm:py-3">
            <div className="flex shrink-0 items-center gap-2 sm:gap-2.5 lg:hidden">
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full bg-gc text-ink shadow-[0_1px_3px_rgba(0,0,0,0.08)] active:scale-[0.98]"
                aria-label="פתח תפריט"
              >
                <Menu size={22} />
              </button>
            </div>

            <div className="flex min-w-0 flex-1 items-center gap-2.5">
              <span
                className="hidden h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-primary-500 shadow-[0_0_0_3px_rgba(16,185,129,0.18)] sm:block"
                aria-hidden
              />
              <div className="min-w-0">
                <p className="truncate text-[11px] font-medium text-ink-faint sm:text-xs">
                  {dayPart} <span aria-hidden>·</span> פאנל ניהול NuraWell
                </p>
                <h2 className="flex min-w-0 items-center gap-1.5 truncate font-display text-base font-black leading-tight tracking-tight sm:text-lg md:text-xl">
                  <span className="text-ink">
                    {greetingName ? `שלום, ${greetingName}` : 'שלום'}
                  </span>
                  <span className="onboarding-wave-hand shrink-0" aria-hidden>
                    👋
                  </span>
                </h2>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2 sm:gap-2.5">
              <ProductSwitcher />
              <AdminNotificationsBell opsHref={opsHref} />

              <div className="flex items-center gap-2.5 rounded-full bg-gc py-1 pe-1 ps-2.5 shadow-[0_1px_3px_rgba(0,0,0,0.08)] sm:ps-3">
                <div className="hidden min-w-0 flex-col items-end leading-tight sm:flex">
                  <span className="max-w-40 truncate text-sm font-bold text-primary-950">
                    {adminDisplayName}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary-700/85">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary-500" aria-hidden />
                    מנהל מערכת
                  </span>
                </div>
                <div
                  className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full bg-linear-to-br from-iris-300 via-primary-200 to-secondary-200 p-[2px] shadow-md ring-1 ring-gc/70 sm:h-10 sm:w-10"
                  title={adminDisplayName}
                >
                  <div className="relative h-full w-full overflow-hidden rounded-full bg-background-card">
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
                      <span className="flex h-full w-full items-center justify-center bg-linear-to-br from-primary-100 to-iris-100 font-display text-sm font-black text-primary-800">
                        {adminDisplayName.charAt(0)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </header>

        <div
          id="main-content"
          className="mx-auto w-full max-w-5xl flex-1 space-y-6 px-3 py-5 sm:space-y-8 sm:px-4 sm:py-6 md:px-6 md:py-8 safe-area-bottom"
        >
          {licenseAlert ? (
            <div role="status" className="rounded-2xl border border-amber-400/50 bg-amber-100/70 px-4 py-3 text-sm text-amber-950">
              יש לטפל ברישיון או בחיוב של המוצר. המודולים ממשיכים לפעול; ההודעה מוצגת רק למנהלים.
            </div>
          ) : null}
          {isHome ? <AdminAiAssistantCard opsHref={opsHref} /> : null}
          {children}
        </div>
      </main>

      <nav
        className="fixed bottom-0 inset-e-0 inset-s-0 z-30 flex border-t border-forest-950/8 bg-gc/90 px-1 py-1.5 backdrop-blur-xl safe-area-bottom lg:hidden"
        aria-label="ניווט מהיר"
      >
        <Link prefetch={false} href={homeHref} onClick={() => setSidebarOpen(false)} className={bottomNavClass(isHome)}>
          <LayoutDashboard className={cn('h-5 w-5', isHome ? 'text-primary-600' : '')} />
          ראשי
        </Link>
        <NavLink prefetch={false} href={opsHref('/users')} onClick={() => setSidebarOpen(false)} className={bottomNavClass(isUsers)}>
          <UserCircle className={cn('h-5 w-5', isUsers ? 'text-primary-600' : '')} />
          משתמשים
        </NavLink>
        <NavLink prefetch={false} href={opsHref('/demo-access')} onClick={() => setSidebarOpen(false)} className={bottomNavClass(isDemoAccess)}>
          <FlaskConical className={cn('h-5 w-5', isDemoAccess ? 'text-accent-600' : '')} />
          דמו
        </NavLink>
        <NavLink prefetch={false} href={opsHref('/mentors')} onClick={() => setSidebarOpen(false)} className={bottomNavClass(isAlmogSettings)}>
          <Sparkles className={cn('h-5 w-5', isAlmogSettings ? 'text-iris-600' : '')} />
          אלמוג
        </NavLink>
        <NavLink prefetch={false} href={opsHref('/journey')} onClick={() => setSidebarOpen(false)} className={bottomNavClass(isJourneyManage)}>
          <Map className={cn('h-5 w-5', isJourneyManage ? 'text-accent-600' : '')} />
          מסע
        </NavLink>
      </nav>
    </div>
    </MediaManagerProvider>
    </HiddenNav.Provider>
  );
}
