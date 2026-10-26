'use client';

import Link from 'next/link';
import { User } from '@supabase/supabase-js';
import { BookOpen, TrendingUp, UserCircle, X, Menu, Home, LogOut, ListChecks } from 'lucide-react';
import { useState } from 'react';
import { signOutClient } from '../../lib/auth/sign-out-client';
import { motion, AnimatePresence } from 'framer-motion';
import { NotificationsBellButton } from '../notifications/NotificationsBellButton';
import { APP_HOME_PATH } from '../../lib/navigation/app-home-path';

interface MobileHeaderProps {
  user: User;
  /** שם מלא מהפרופיל המוצפן (המקור היחיד; user_metadata לא נקרא) */
  profileFullName?: string | null;
}

const menuItems = [
  { href: APP_HOME_PATH, label: 'בית',           icon: Home,        color: '#047857' },
  { href: '/plans',      label: 'התוכנית שלי',   icon: ListChecks,  color: '#059669' },
  { href: '/guides',    label: 'המדריכים שלי',  icon: BookOpen,    color: '#10b981' },
  { href: '/progress',   label: 'התקדמות שלי', icon: TrendingUp,  color: '#14b8a6' },
  { href: '/profile',    label: 'הפרופיל שלי',  icon: UserCircle, color: '#f59e0b' },
];

export function MobileHeader({ user, profileFullName }: MobileHeaderProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const fullName = String(profileFullName || '').trim();
  const firstName = fullName.split(/\s+/)[0] || '';

  const handleSignOut = async () => {
    setIsSigningOut(true);
    setIsMenuOpen(false);
    await signOutClient('/');
  };

  return (
    <>
      <header
        className="fixed top-0 inset-e-0 inset-s-0 z-50 safe-area-top overflow-hidden"
        style={{ background: 'linear-gradient(160deg, var(--color-header-from) 0%, var(--color-header-to) 100%)' }}
      >
        <div className="container-mobile h-16 flex items-center justify-between gap-3 relative z-10">
          {/* RTL: הילד הראשון בצד ימין — ההמבורגר בימין */}
          <div className="flex min-w-[96px] items-center justify-start">
            <button
              aria-label={isMenuOpen ? 'סגור תפריט' : 'פתח תפריט'}
              className="w-[42px] h-[42px] rounded-[14px] flex flex-col items-center justify-center gap-[4px] transition-all duration-200 hover:scale-105 active:scale-90"
              style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)', backdropFilter: 'blur(10px)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.15)' }}
              onClick={() => setIsMenuOpen(!isMenuOpen)}
            >
              <AnimatePresence mode="wait" initial={false}>
                {isMenuOpen ? (
                  <motion.span key="close" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.15 }}>
                    <X className="w-5 h-5 text-on-dark" />
                  </motion.span>
                ) : (
                  <motion.span key="menu" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }} transition={{ duration: 0.15 }}>
                    <Menu className="w-5 h-5 text-on-dark" />
                  </motion.span>
                )}
              </AnimatePresence>
            </button>
          </div>

          <Link
            href={APP_HOME_PATH}
            prefetch
            aria-label="NuraWell — מעבר למסך הבית"
            className="absolute left-1/2 -translate-x-1/2 no-tap-highlight"
            onClick={() => setIsMenuOpen(false)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- static brand SVG */}
            <img
              src="/brand/nurawell-special-on-dark.svg"
              alt="NuraWell"
              width={122}
              height={24}
              style={{ display: 'block', height: 24, width: 'auto' }}
            />
          </Link>

          <div className="flex min-w-[96px] items-center justify-end">
            <NotificationsBellButton />
          </div>
        </div>

        <AnimatePresence>
          {isMenuOpen && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: 'easeOut' as const }}
              className="container-mobile pb-4 pt-2"
            >
              <motion.div className="rounded-2xl overflow-hidden bg-background-card" style={{ border: '1px solid rgba(0,0,0,0.06)', boxShadow: '0 8px 32px rgba(0,0,0,0.1)' }}>
                {menuItems.map((item, idx) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    prefetch
                    onClick={() => setIsMenuOpen(false)}
                    className={`flex items-center gap-3.5 px-5 py-4 transition-all hover:bg-ink-50 active:bg-ink-100 no-tap-highlight ${idx < menuItems.length - 1 ? 'border-b border-ink-100' : ''}`}
                  >
                    <motion.div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: `${item.color}12`, border: `1px solid ${item.color}25` }}>
                      <item.icon style={{ color: item.color }} />
                    </motion.div>
                    <span className="font-bold text-ink-800 flex-1">{item.label}</span>
                    <item.icon className="w-3.5 h-3.5 text-ink-400" />
                  </Link>
                ))}
                <button
                  type="button"
                  disabled={isSigningOut}
                  onClick={() => void handleSignOut()}
                  className="flex w-full items-center gap-3.5 border-t border-ink-100 px-5 py-4 text-start transition hover:bg-coral-50 active:bg-coral-100 disabled:opacity-60"
                >
                  <motion.div
                    className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl"
                    style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)' }}
                  >
                    {isSigningOut ? (
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-coral-400/40 border-t-coral-600" />
                    ) : (
                      <LogOut className=" text-coral-600" />
                    )}
                  </motion.div>
                  <span className="flex-1 font-bold text-coral-700">התנתקות</span>
                </button>
                <motion.div className="flex items-center gap-2.5 border-t border-ink-100 px-5 py-3">
                  <UserCircle className="h-4 w-4 text-ink-400" />
                  <p className="text-xs font-medium text-ink-500">{firstName ? `שלום ${firstName}` : 'שלום'} 👋</p>
                </motion.div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      <AnimatePresence>
        {isMenuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-forest-950/40 backdrop-blur-sm"
            onClick={() => setIsMenuOpen(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
