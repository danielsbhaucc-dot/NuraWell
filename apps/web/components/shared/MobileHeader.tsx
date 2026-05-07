'use client';

import Link from 'next/link';
import { User } from '@supabase/supabase-js';
import { BookOpen, TrendingUp, UserCircle, X, Menu, Bell } from 'lucide-react';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface MobileHeaderProps {
  user: User;
  title?: string;
}

const menuItems = [
  { href: '/courses',  label: 'הקורסים שלי',  icon: BookOpen,    color: '#10b981' },
  { href: '/progress', label: 'התקדמות שלי', icon: TrendingUp,  color: '#14b8a6' },
  { href: '/profile',  label: 'הפרופיל שלי',  icon: UserCircle, color: '#f59e0b' },
];

export function MobileHeader({ user, title }: MobileHeaderProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const userName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'שלום';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'בוקר טוב,' : hour < 17 ? 'צהריים טובים,' : hour < 21 ? 'ערב טוב,' : 'לילה טוב,';

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50 safe-area-top overflow-hidden"
        style={{ background: 'linear-gradient(160deg, #047857 0%, #059669 50%, #10b981 100%)' }}>

        <div className="container-mobile h-16 flex items-center justify-between gap-3 relative z-10">
          {/* Greeting */}
          <Link href="/courses" className="no-tap-highlight" onClick={() => setIsMenuOpen(false)}>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)', fontWeight: 400, marginBottom: '2px' }}>{greeting}</div>
            <div style={{ fontSize: '22px', fontWeight: 900, color: '#fff', lineHeight: 1, fontFamily: "'Rubik','Heebo',sans-serif" }}>
              {userName} <span style={{ fontSize: '18px' }}>☀️</span>
            </div>
          </Link>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              aria-label="התראות"
              className="w-[42px] h-[42px] rounded-[14px] flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-90"
              style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)', backdropFilter: 'blur(10px)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.15)' }}
            >
              <Bell className="w-5 h-5 text-white/90" />
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
          </div>
        </div>

        {/* Dropdown Menu */}
        <AnimatePresence>
          {isMenuOpen && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="container-mobile pb-4 pt-2"
            >
              <div className="rounded-2xl overflow-hidden bg-white" style={{ border: '1px solid rgba(0,0,0,0.06)', boxShadow: '0 8px 32px rgba(0,0,0,0.1)' }}>
                {menuItems.map((item, idx) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setIsMenuOpen(false)}
                    className={`flex items-center gap-3.5 px-5 py-4 transition-all hover:bg-gray-50 active:bg-gray-100 no-tap-highlight ${idx < menuItems.length - 1 ? 'border-b border-gray-100' : ''}`}
                  >
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: `${item.color}12`, border: `1px solid ${item.color}25` }}>
                      <item.icon className="w-4.5 h-4.5" style={{ color: item.color }} />
                    </div>
                    <span className="font-bold text-gray-800 flex-1">{item.label}</span>
                    <item.icon className="w-3.5 h-3.5 text-gray-400" />
                  </Link>
                ))}
                <div className="px-5 py-3.5 border-t border-gray-100 flex items-center gap-2.5">
                  <UserCircle className="w-4 h-4 text-gray-400" />
                  <p className="text-xs text-gray-400 font-medium">
                    שלום, {user.email?.split('@')[0]}
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* Backdrop */}
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
