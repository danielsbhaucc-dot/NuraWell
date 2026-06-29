'use client';

import { Bell } from 'lucide-react';
import { useNotificationsDrawer } from '@/components/notifications/NotificationsProvider';

export function ChallengeNotificationsBell() {
  const { open, unreadCount } = useNotificationsDrawer();

  return (
    <button
      type="button"
      aria-label={unreadCount > 0 ? `התראות, ${unreadCount} שלא נקראו` : 'התראות'}
      onClick={() => open()}
      className="fixed left-4 top-4 z-40 flex h-11 w-11 items-center justify-center rounded-2xl border border-white/15 bg-black/40 text-white shadow-lg backdrop-blur-md transition hover:bg-black/55 active:scale-95 safe-area-top"
    >
      <Bell className="h-5 w-5" />
      {unreadCount > 0 ? (
        <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-500 px-1 text-[10px] font-bold text-white">
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      ) : null}
    </button>
  );
}
