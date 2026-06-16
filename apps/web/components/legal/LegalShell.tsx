'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { ArrowRight, ArrowUp, Leaf } from 'lucide-react';

export type LegalNavItem = { href: string; label: string };

export const LEGAL_NAV: LegalNavItem[] = [
  { href: '/terms', label: 'תנאי שימוש' },
  { href: '/privacy', label: 'מדיניות פרטיות' },
  { href: '/safety', label: 'בטיחות' },
  { href: '/accessibility', label: 'נגישות וזכויות יוצרים' },
];

const ease = [0.22, 1, 0.36, 1] as const;

export function LegalShell({
  icon,
  title,
  subtitle,
  updatedAt,
  children,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  updatedAt: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [showTop, setShowTop] = useState(false);

  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 600);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="legal-page">
      <div className="legal-aurora" aria-hidden>
        <span className="legal-aurora-orb a" />
        <span className="legal-aurora-orb b" />
        <span className="legal-aurora-orb c" />
      </div>

      <div className="legal-shell">
        <div className="legal-topbar">
          <Link href="/" className="legal-brand" aria-label="חזרה לעמוד הבית של NuraWell">
            <span className="legal-brand-mark" aria-hidden>
              <Leaf className="w-4 h-4" />
            </span>
            NuraWell
          </Link>
          <Link href="/" className="legal-back">
            לעמוד הבית
            <ArrowRight className="w-4 h-4" aria-hidden />
          </Link>
        </div>

        <motion.header
          className="legal-hero"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease }}
        >
          <span className="legal-hero-icon" aria-hidden>
            {icon}
          </span>
          <h1 className="legal-hero-title">{title}</h1>
          <p className="legal-hero-sub">{subtitle}</p>
          <span className="legal-hero-meta">עודכן לאחרונה: {updatedAt}</span>
        </motion.header>

        <nav className="legal-nav" aria-label="ניווט בין מסמכים משפטיים">
          {LEGAL_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="legal-nav-pill"
              aria-current={pathname === item.href ? 'page' : undefined}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <motion.main
          id="main-content"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease, delay: 0.1 }}
        >
          {children}
        </motion.main>

        <footer className="legal-footer">
          <div className="legal-footer-links">
            {LEGAL_NAV.map((item) => (
              <Link key={item.href} href={item.href}>
                {item.label}
              </Link>
            ))}
          </div>
          <p className="legal-footer-copy">
            © {new Date().getFullYear()} NuraWell — כל הזכויות שמורות. נבנה באהבה לשינוי אורח חיים בריא 🌿
          </p>
        </footer>
      </div>

      {showTop ? (
        <motion.button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          aria-label="חזרה לראש העמוד"
          className="landing-scroll-top"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          whileTap={{ scale: 0.95 }}
        >
          <ArrowUp className="w-5 h-5" aria-hidden />
        </motion.button>
      ) : null}
    </div>
  );
}
