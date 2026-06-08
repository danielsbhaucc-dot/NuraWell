'use client';

import Link from 'next/link';
import { User } from '@supabase/supabase-js';
import { BookOpen, TrendingUp, UserCircle, X, Menu, Bell, Home, LogOut } from 'lucide-react';
import { useState } from 'react';
import { signOutClient } from '../../lib/auth/sign-out-client';
import { motion, AnimatePresence } from 'framer-motion';
import { useNotificationsDrawer } from '../notifications/NotificationsProvider';
import { APP_HOME_PATH } from '../../lib/navigation/app-home-path';

interface MobileHeaderProps {
  user: User;
  title?: string;
}

const menuItems = [
  { href: APP_HOME_PATH, label: 'בית',           icon: Home,        color: '#047857' },
  { href: '/courses',    label: 'המדריכים שלי',  icon: BookOpen,    color: '#10b981' },
  { href: '/progress',   label: 'התקדמות שלי', icon: TrendingUp,  color: '#14b8a6' },
  { href: '/profile',    label: 'הפרופיל שלי',  icon: UserCircle, color: '#f59e0b' },
];

export function MobileHeader({ user, title }: MobileHeaderProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const { open: openNotifications, unreadCount } = useNotificationsDrawer();
  const fullName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'משתמש';
  const firstName = String(fullName).trim().split(/\s+/)[0] || 'משתמש';

  const handleSignOut = async () => {
    setIsSigningOut(true);
    setIsMenuOpen(false);
    await signOutClient('/');
  };

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50 safe-area-top overflow-hidden"
        style={{ background: 'linear-gradient(160deg, #047857 0%, #059669 50%, #10b981 100%)' }}>

        <motion.div className="container-mobile h-16 flex items-center justify-between gap-3 relative z-10">
          <Link href={APP_HOME_PATH} prefetch className="no-tap-highlight min-w-[72px]" onClick={() => setIsMenuOpen(false)}>
            <motion.div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.85)', fontWeight: 700, fontFamily: "'Rubik','Heebo',sans-serif" }}>
              {title || 'NuraWell'}
            </motion.div>
          </Link>

          <Link
            href={APP_HOME_PATH}
            prefetch
            aria-label="מעבר למסך הבית"
            className="absolute left-1/2 -translate-x-1/2 rounded-xl px-3 py-1.5 no-tap-highlight"
            style={{
              background: 'rgba(255,255,255,0.14)',
              border: '1px solid rgba(255,255,255,0.28)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.24)',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
            }}
          >
            <span style={{ color: '#fff', fontWeight: 900, fontSize: '13px', letterSpacing: '0.2px', fontFamily: "'Rubik','Heebo',sans-serif" }}>
              NuraWell.ai
            </span>
          </Link>

          <motion.div className="flex items-center gap-2">
            <button
              type="button"
              aria-label={unreadCount > 0 ? `התראות, ${unreadCount} שלא נקראו` : 'התראות'}
              onClick={() => openNotifications()}
              className="relative w-[42px] h-[42px] rounded-[14px] flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-90"
              style={{
                background: 'linear-gradient(145deg, rgba(255,255,255,0.22), rgba(255,255,255,0.08))',
                border: '1px solid rgba(255,255,255,0.35)',
                backdropFilter: 'blur(10px)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.25), 0 4px 16px rgba(192,38,211,0.15)',
              }}
            >
              <Bell className="w-5 h-5 text-white drop-shadow-sm" strokeWidth={2.2} />
              {unreadCount > 0 && (
                <span
                  className="absolute -right-0.5 -top-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full text-[10px] font-black leading-none text-white border-2 border-white/90 shadow-md"
                  style={{
                    background: 'linear-gradient(135deg, #f97316, #ec4899, #a855f7)',
                  }}
                >
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
            <button
              aria-label={isMenuOpen ? 'סגור תפריט' : 'פתח תפריט'}
              className="w-[42px] h-[42px] rounded-[14px] flex flex-col items-center justify-center gap-[4px] transition-all duration-200 hover:scale-105 active:scale-90"
              style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)', backdropFilter: 'blur(10px)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.15)' }}
              onClick={() => setIsMenuOpen(!isMenuOpen)}
            >
              <AnimatePresence mode="wait" initial={false}>
                {isMenuOpen ? (
                  <motion.span key="close" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.15 }}>
                    <X className="w-5 h-5 text-white" />
                  </motion.span>
                ) : (
                  <motion.span key="menu" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }} transition={{ duration: 0.15 }}>
                    <Menu className="w-5 h-5 text-white" />
                  </motion.span>
                )}
              </AnimatePresence>
            </button>
          </motion.div>
        </motion.div>

        <AnimatePresence>
          {isMenuOpen && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="container-mobile pb-4 pt-2"
            >
              <motion.div className="rounded-2xl overflow-hidden bg-white" style={{ border: '1px solid rgba(0,0,0,0.06)', boxShadow: '0 8px 32px rgba(0,0,0,0.1)' }}>
                {menuItems.map((item, idx) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    prefetch
                    onClick={() => setIsMenuOpen(false)}
                    className={`flex items-center gap-3.5 px-5 py-4 transition-all hover:bg-gray-50 active:bg-gray-100 no-tap-highlight ${idx < menuItems.length - 1 ? 'border-b border-gray-100' : ''}`}
                  >
                    <motion.div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: `${item.color}12`, border: `1px solid ${item.color}25` }}>
                      <item.icon className="w-4.5 h-4.5" style={{ color: item.color }} />
                    </motion.div>
                    <span className="font-bold text-gray-800 flex-1">{item.label}</span>
                    <item.icon className="w-3.5 h-3.5 text-gray-400" />
                  </Link>
                ))}
                <button
                  type="button"
                  disabled={isSigningOut}
                  onClick={() => void handleSignOut()}
                  className="flex w-full items-center gap-3.5 border-t border-gray-100 px-5 py-4 text-right transition hover:bg-red-50 active:bg-red-100 disabled:opacity-60"
                >
                  <motion.div
                    className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl"
                    style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)' }}
                  >
                    {isSigningOut ? (
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-red-400/40 border-t-red-600" />
                    ) : (
                      <LogOut className="h-4.5 w-4.5 text-red-600" />
                    )}
                  </motion.div>
                  <span className="flex-1 font-bold text-red-700">התנתקות</span>
                </button>
                <motion.div className="flex items-center gap-2.5 border-t border-gray-100 px-5 py-3">
                  <UserCircle className="h-4 w-4 text-gray-400" />
                  <p className="text-xs font-medium text-gray-400">שלום, {firstName}</p>
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
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
            onClick={() => setIsMenuOpen(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
