'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { BookOpen, Sparkles, Route, Home, ClipboardCheck } from 'lucide-react';
import { APP_HOME_PATH } from '../../lib/navigation/app-home-path';
import { cn } from '../../lib/cn';
import { motion } from 'framer-motion';
import { useEffect } from 'react';
import { useActionHub } from '../action-hub/ActionHubProvider';

const leftItems = [
  { href: APP_HOME_PATH, label: 'בית',    icon: Home  },
  { href: '/journey',    label: 'המסע',  icon: Route },
];
const rightItems = [
  { href: '/guides', label: 'מדריכים', icon: BookOpen },
  { href: '/plans', label: 'התוכנית', icon: ClipboardCheck },
];

export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const actionHub = useActionHub();

  useEffect(() => {
    const fastRoutes = [APP_HOME_PATH, '/guides', '/journey', '/journey/declined', '/plans', '/progress', '/progress/history', '/profile', '/settings/almog'];
    fastRoutes.forEach((href) => router.prefetch(href));
  }, [router]);

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 safe-area-bottom">
      {/* שכבת זכוכית */}
      <div
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(180deg, rgba(255,255,255,0.72) 0%, rgba(255,255,255,0.92) 100%)',
          backdropFilter: 'blur(22px) saturate(180%)',
          WebkitBackdropFilter: 'blur(22px) saturate(180%)',
          borderTop: '1px solid rgba(255,255,255,0.85)',
          boxShadow: '0 -10px 34px rgba(6,78,59,0.10)',
        }}
      />
      {/* קו הדגשה עליון בגרדיאנט */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-px"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(16,185,129,0.55), transparent)' }}
      />
      <div className="container-mobile relative">
        {/* Center raised button */}
        <div className="absolute left-1/2 -translate-x-1/2 -top-6 z-20">
          {/* טבעת זוהר נושמת */}
          <motion.span
            aria-hidden
            className="absolute inset-0 rounded-[22px]"
            style={{ background: 'radial-gradient(circle, rgba(16,185,129,0.45), transparent 70%)', filter: 'blur(8px)' }}
            animate={{ scale: [1, 1.18, 1], opacity: [0.55, 0.9, 0.55] }}
            transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.button
            type="button"
            aria-label="דיווח התקדמות למנטור — משימות והרגלים"
            onClick={() => actionHub.open()}
            whileTap={{ scale: 0.92 }}
            className="relative flex items-center justify-center no-tap-highlight touch-manipulation"
            style={{
              width: '60px', height: '60px',
              background: 'linear-gradient(150deg, #064e3b 0%, #059669 55%, #34d399 100%)',
              borderRadius: '22px',
              boxShadow: '0 10px 28px rgba(6,78,59,0.45), inset 0 1px 0 rgba(255,255,255,0.35)',
              border: '1.5px solid rgba(255,255,255,0.45)',
            }}
          >
            <span
              aria-hidden
              className="pointer-events-none absolute inset-x-2 top-1 h-3 rounded-full"
              style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.5), transparent)' }}
            />
            <Sparkles className="h-6 w-6 text-white drop-shadow" strokeWidth={2.2} />
          </motion.button>
        </div>

        <div className="flex items-stretch justify-around gap-1 py-2 px-2">
          {/* Left items */}
          {leftItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (<NavItem key={item.href} item={item} isActive={isActive} pathname={pathname} />);
          })}

          {/* Center spacer */}
          <div className="w-14 flex-shrink-0" />

          {/* Right items */}
          {rightItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (<NavItem key={item.href} item={item} isActive={isActive} pathname={pathname} />);
          })}
        </div>
      </div>
    </nav>
  );
}

function NavItem({ item, isActive }: { item: { href: string; label: string; icon: React.ElementType }; isActive: boolean; pathname: string }) {
  return (
    <div className="flex-1 flex justify-center">
      <Link
        href={item.href}
        prefetch
        className={cn(
          'relative flex flex-col items-center justify-center gap-1 px-1 py-1.5 rounded-2xl transition-all duration-200 no-tap-highlight touch-manipulation min-w-0 w-full',
          isActive ? 'text-[#047857]' : 'text-[#9896B8] hover:text-[#5A5880]'
        )}
      >
        {isActive && (
          <motion.div
            layoutId="nav-indicator"
            className="absolute inset-x-1 inset-y-0 rounded-2xl"
            style={{
              background: 'linear-gradient(165deg, rgba(16,185,129,0.16), rgba(16,185,129,0.06))',
              border: '1px solid rgba(16,185,129,0.24)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.5)',
            }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
          />
        )}
        <motion.div
          animate={{ scale: isActive ? 1.12 : 1, y: isActive ? -1 : 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          className="relative z-10"
        >
          <item.icon className="w-[22px] h-[22px]" strokeWidth={isActive ? 2.4 : 1.8} />
        </motion.div>
        <span
          className={cn(
            'text-[10.5px] leading-none font-bold relative z-10 whitespace-nowrap transition-all',
            isActive ? 'text-[#047857]' : 'text-[#9896B8]'
          )}
        >
          {item.label}
        </span>
      </Link>
    </div>
  );
}
