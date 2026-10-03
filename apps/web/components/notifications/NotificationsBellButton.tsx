'use client';

import { useEffect, useRef, useState } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import {
  formatUnreadBadgeCount,
  formatUnreadBellAriaLabel,
} from '@/lib/notifications/format-unread-badge';
import { useNotificationsDrawer } from './NotificationsProvider';
import { cn } from '@/lib/cn';

type NotificationsBellButtonProps = {
  className?: string;
  badgeClassName?: string;
  /** סגנון ויזואלי לדף האתגר (כהה) מול הכותרת הרגילה */
  variant?: 'header' | 'challenge';
};

/**
 * פעמון התראות עם תג מסונכרן ל-a11y, ותפריט קצר שמציע "סמן הכל כנקרא".
 */
export function NotificationsBellButton({
  className,
  badgeClassName,
  variant = 'header',
}: NotificationsBellButtonProps) {
  const { open, unreadCount, markAllRead } = useNotificationsDrawer();
  const [menuOpen, setMenuOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointer = (e: MouseEvent | TouchEvent) => {
      const el = rootRef.current;
      if (!el) return;
      if (e.target instanceof Node && !el.contains(e.target)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('touchstart', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('touchstart', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const openInbox = () => {
    setMenuOpen(false);
    open();
  };

  const handleBellClick = () => {
    if (unreadCount > 0) {
      setMenuOpen((v) => !v);
      return;
    }
    openInbox();
  };

  const handleMarkAll = async () => {
    setMenuOpen(false);
    await markAllRead();
  };

  const isChallenge = variant === 'challenge';

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        aria-label={formatUnreadBellAriaLabel(unreadCount)}
        aria-haspopup={unreadCount > 0 ? 'menu' : undefined}
        aria-expanded={unreadCount > 0 ? menuOpen : undefined}
        onClick={handleBellClick}
        className={cn(
          isChallenge
            ? 'relative flex h-11 w-11 items-center justify-center rounded-2xl border border-white/15 bg-black/40 text-white shadow-lg backdrop-blur-md transition hover:bg-black/55 active:scale-95'
            : 'relative w-[42px] h-[42px] rounded-[14px] flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-90',
          className
        )}
        style={
          isChallenge
            ? undefined
            : {
                background:
                  'linear-gradient(145deg, rgba(255,255,255,0.22), rgba(255,255,255,0.08))',
                border: '1px solid rgba(255,255,255,0.35)',
                backdropFilter: 'blur(10px)',
                boxShadow:
                  'inset 0 1px 0 rgba(255,255,255,0.25), 0 4px 16px rgba(192,38,211,0.15)',
              }
        }
      >
        <Bell
          className={cn(isChallenge ? 'h-5 w-5' : 'w-5 h-5 text-white drop-shadow-sm')}
          strokeWidth={2.2}
        />
        {unreadCount > 0 && (
          <span
            className={cn(
              isChallenge
                ? 'absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-500 px-1 text-[10px] font-bold text-white'
                : 'absolute -right-0.5 -top-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full text-[10px] font-black leading-none text-white border-2 border-white/90 shadow-md',
              badgeClassName
            )}
            style={
              isChallenge
                ? undefined
                : {
                    background: 'linear-gradient(135deg, #f97316, #ec4899, #a855f7)',
                  }
            }
            aria-hidden
          >
            {formatUnreadBadgeCount(unreadCount)}
          </span>
        )}
      </button>

      {menuOpen && unreadCount > 0 ? (
        <div
          role="menu"
          className={cn(
            'absolute z-50 mt-2 min-w-[11.5rem] overflow-hidden rounded-2xl border shadow-xl',
            isChallenge
              ? 'left-0 border-white/15 bg-zinc-950/95 text-white'
              : 'right-0 border-emerald-100/80 bg-white/95 text-emerald-950'
          )}
        >
          <button
            type="button"
            role="menuitem"
            className={cn(
              'flex w-full items-center gap-2 px-3.5 py-2.5 text-right text-[13px] font-bold transition',
              isChallenge ? 'hover:bg-white/10' : 'hover:bg-emerald-50'
            )}
            onClick={openInbox}
          >
            <Bell className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
            הצג התראות
          </button>
          <button
            type="button"
            role="menuitem"
            className={cn(
              'flex w-full items-center gap-2 border-t px-3.5 py-2.5 text-right text-[13px] font-bold transition',
              isChallenge
                ? 'border-white/10 hover:bg-white/10'
                : 'border-emerald-100 hover:bg-emerald-50'
            )}
            onClick={() => void handleMarkAll()}
          >
            <CheckCheck className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
            סמן הכל כנקרא
          </button>
        </div>
      ) : null}
    </div>
  );
}
