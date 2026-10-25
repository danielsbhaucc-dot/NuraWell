'use client';

import { Bell } from 'lucide-react';
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
 * פעמון התראות עם תג — לחיצה פותחת את מגירת ההתראות (bottom drawer).
 * "סמן הכל כנקרא" זמין בתוך המגירה עצמה.
 */
export function NotificationsBellButton({
  className,
  badgeClassName,
  variant = 'header',
}: NotificationsBellButtonProps) {
  const { open, unreadCount } = useNotificationsDrawer();
  const isChallenge = variant === 'challenge';

  return (
    <button
      type="button"
      aria-label={formatUnreadBellAriaLabel(unreadCount)}
      onClick={() => open()}
      className={cn(
        isChallenge
          ? 'relative flex h-11 w-11 items-center justify-center rounded-2xl border border-on-dark/15 bg-forest-950/40 text-on-dark shadow-lg backdrop-blur-md transition hover:bg-forest-950/55 active:scale-95'
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
        className={cn(isChallenge ? 'h-5 w-5' : 'w-5 h-5 text-on-dark drop-shadow-xs')}
        strokeWidth={2.2}
      />
      {unreadCount > 0 && (
        <span
          className={cn(
            isChallenge
              ? 'absolute -inset-s-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary-500 px-1 text-[10px] font-bold text-on-dark'
              : 'absolute -inset-s-0.5 -top-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full text-[10px] font-black leading-none text-on-dark border-2 border-on-dark/90 shadow-md',
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
  );
}
