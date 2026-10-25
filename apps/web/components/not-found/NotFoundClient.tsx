'use client';

import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  BookOpen,
  Home,
  Info,
  Leaf,
  LogIn,
  Mail,
  Route,
  type LucideIcon,
} from 'lucide-react';
import { getNotFoundLinks, type NotFoundLink } from '@/lib/navigation/not-found-links';

const LINK_ICONS: Record<string, LucideIcon> = {
  '/': Home,
  '/home': Home,
  '/login': LogIn,
  '/about': Info,
  '/contact': Mail,
  '/journey': Route,
  '/guides': BookOpen,
};

function iconFor(href: string): LucideIcon {
  try {
    const u = href.startsWith('http') ? new URL(href).pathname : href;
    return LINK_ICONS[u] ?? LINK_ICONS[u.replace(/\/$/, '') || '/'] ?? Home;
  } catch {
    return Home;
  }
}

const secondaryBtnClass =
  'flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all hover:scale-[1.01] active:scale-95';
const secondaryBtnStyle = {
  background: 'rgba(0,0,0,0.03)',
  border: '1.5px solid rgba(0,0,0,0.08)',
  color: 'var(--color-ink-soft)',
} as const;

function isAbsolute(href: string): boolean {
  return href.startsWith('http://') || href.startsWith('https://');
}

/** Absolute hrefs use plain <a> so the App Router never prefetches/navigates on a stealth host. */
function NavAnchor({
  href,
  className,
  style,
  children,
}: {
  href: string;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  if (isAbsolute(href)) {
    return (
      <a href={href} className={className} style={style}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={className} style={style} prefetch={false}>
      {children}
    </Link>
  );
}

function SecondaryLink({ link }: { link: NotFoundLink }) {
  const Icon = iconFor(link.href);
  return (
    <NavAnchor href={link.href} className={secondaryBtnClass} style={secondaryBtnStyle}>
      <Icon className="w-4 h-4" />
      <span>{link.label}</span>
    </NavAnchor>
  );
}

type Props = {
  isAuthenticated: boolean;
  /** When set (Ops stealth), all CTAs point at this public origin. */
  absoluteOrigin?: string | null;
};

export default function NotFoundClient({ isAuthenticated, absoluteOrigin = null }: Props) {
  const { primary, secondary } = getNotFoundLinks(isAuthenticated, absoluteOrigin);
  const PrimaryIcon = iconFor(primary.href);
  const leaveStealth = Boolean(absoluteOrigin);

  const [firstSecondary, ...restSecondary] = secondary;

  return (
    <main id="main-content" className="min-h-screen flex flex-col items-center justify-center px-4 py-10 bg-mesh">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="max-w-md w-full text-center"
      >
        <div className="relative mb-8">
          <div className="text-8xl font-black mb-4 text-gradient">404</div>
          <motion.div
            animate={{ rotate: [0, -10, 10, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="absolute -top-4 -inset-s-4 text-4xl"
          >
            🍃
          </motion.div>
          <motion.div
            animate={{ rotate: [0, 10, -10, 0] }}
            transition={{ duration: 2.5, repeat: Infinity, delay: 0.5 }}
            className="absolute -bottom-2 -inset-e-4 text-3xl"
          >
            🌿
          </motion.div>
        </div>

        <div
          className="rounded-2xl overflow-hidden mb-8"
          style={{ border: '1px solid rgba(0,0,0,0.06)', boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}
        >
          <div className="px-6 py-5" style={{ background: 'linear-gradient(145deg, var(--color-forest-800), var(--color-forest-600) 60%, var(--color-primary-600))' }}>
            <h1 className="text-2xl font-black text-on-dark">אופס! הדף לא נמצא 🌱</h1>
          </div>
          <div className="p-6 bg-background-card">
            <p className="text-ink-soft text-lg leading-relaxed mb-4">
              נראה שטיילתם קצת רחוק מדי בדרך לבריאות...
            </p>
            <p className="text-ink-faint text-sm">הדף שחיפשתם לא קיים או שהועבר למקום אחר</p>
          </div>
        </div>

        <div className="space-y-3">
          <NavAnchor
            href={primary.href}
            className="flex items-center justify-center gap-2 w-full py-4 rounded-2xl font-bold text-lg text-on-dark transition-all hover:scale-[1.02] active:scale-95"
            style={{
              background: 'linear-gradient(135deg, #047857, #10b981)',
              boxShadow: '0 6px 20px rgba(16,185,129,0.25)',
            }}
          >
            <PrimaryIcon className="w-5 h-5" />
            <span>{primary.label}</span>
          </NavAnchor>

          <div className="flex gap-3">
            {leaveStealth ? (
              <NavAnchor href={primary.href} className={secondaryBtnClass} style={secondaryBtnStyle}>
                <ArrowLeft className="w-4 h-4" />
                <span>חזור אחורה</span>
              </NavAnchor>
            ) : (
              <button
                type="button"
                onClick={() => window.history.back()}
                className={secondaryBtnClass}
                style={secondaryBtnStyle}
              >
                <ArrowLeft className="w-4 h-4" />
                <span>חזור אחורה</span>
              </button>
            )}

            {firstSecondary ? <SecondaryLink link={firstSecondary} /> : null}
          </div>

          {restSecondary.length > 0 ? (
            <div className="flex gap-3">
              {restSecondary.map((link) => (
                <SecondaryLink key={link.href} link={link} />
              ))}
            </div>
          ) : null}
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="mt-10 p-4 rounded-2xl"
          style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.15)' }}
        >
          <div className="flex items-center justify-center gap-2 text-primary-700 text-sm font-bold mb-2">
            <Leaf className="w-4 h-4" />
            <span>הידעת?</span>
          </div>
          <p className="text-ink-soft text-sm">
            צמחים גדלים בכיוון האור — גם כשיש נסיגה קטנה, הם תמיד ממשיכים למעלה! 🌱
          </p>
        </motion.div>
      </motion.div>
    </main>
  );
}
