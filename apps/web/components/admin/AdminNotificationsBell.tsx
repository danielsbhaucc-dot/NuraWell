'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Bell, CheckCheck, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/cn';

type OpsNotification = {
  id: string;
  type: string;
  title: string;
  body: string;
  icon_emoji: string;
  action_url: string | null;
  is_read: boolean;
  created_at: string;
};

function fmtTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat('he-IL', {
      timeZone: 'Asia/Jerusalem',
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

type AdminNotificationsBellProps = {
  opsHref: (path: string) => string;
};

export function AdminNotificationsBell({ opsHref }: AdminNotificationsBellProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notifications, setNotifications] = useState<OpsNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/admin/notifications?limit=40', {
        credentials: 'include',
        cache: 'no-store',
      });
      const data = (await res.json()) as {
        notifications?: OpsNotification[];
        unread_count?: number;
      };
      if (res.ok) {
        setNotifications(data.notifications ?? []);
        setUnreadCount(data.unread_count ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const interval = setInterval(() => void load(), 60_000);
    return () => clearInterval(interval);
  }, [load]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const markRead = async (ids: string[]) => {
    if (ids.length === 0) return;
    await fetch('/api/v1/admin/notifications', {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notificationIds: ids }),
    });
    setNotifications((prev) =>
      prev.map((n) => (ids.includes(n.id) ? { ...n, is_read: true } : n)),
    );
    setUnreadCount((c) => Math.max(0, c - ids.length));
  };

  const markAllRead = async () => {
    await fetch('/api/v1/admin/notifications', {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markAllRead: true }),
    });
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);
  };

  const handleClick = (n: OpsNotification) => {
    if (!n.is_read) void markRead([n.id]);
    setOpen(false);
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative inline-flex min-h-10 min-w-10 items-center justify-center rounded-2xl border border-white/55 bg-white/45 text-emerald-900 shadow-sm backdrop-blur-md transition-colors hover:bg-white/70"
        aria-label={unreadCount > 0 ? `התראות — ${unreadCount} חדשות` : 'התראות'}
        aria-expanded={open}
      >
        <Bell size={19} className="opacity-90" />
        {unreadCount > 0 ? (
          <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white ring-2 ring-white/80">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          className="absolute left-0 top-[calc(100%+0.5rem)] z-50 w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-white/60 bg-[#FFFBF5]/95 shadow-2xl backdrop-blur-xl"
          dir="rtl"
        >
          <div className="flex items-center justify-between border-b border-stone-200/80 bg-[#FFF5E6]/80 px-3 py-2.5">
            <h3 className="text-sm font-bold text-stone-800">התראות</h3>
            <div className="flex items-center gap-1">
              {unreadCount > 0 ? (
                <button
                  type="button"
                  onClick={() => void markAllRead()}
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-50"
                  title="סמן הכל כנקרא"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  הכל נקרא
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1 text-stone-500 hover:bg-stone-100"
                aria-label="סגור"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="max-h-[min(24rem,60vh)] overflow-y-auto">
            {loading && notifications.length === 0 ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-stone-400" />
              </div>
            ) : notifications.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-stone-500">אין התראות</p>
            ) : (
              <ul className="divide-y divide-stone-200/70">
                {notifications.map((n) => {
                  const href = n.action_url?.startsWith('/') ? n.action_url : null;
                  const inner = (
                    <>
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <p
                            className={cn(
                              'text-sm leading-snug',
                              n.is_read ? 'font-medium text-stone-700' : 'font-bold text-stone-900',
                            )}
                          >
                            {n.title}
                          </p>
                          <p className="mt-0.5 whitespace-pre-wrap text-xs leading-relaxed text-stone-600">
                            {n.body}
                          </p>
                          <p className="mt-1 text-[10px] text-stone-400">{fmtTime(n.created_at)}</p>
                        </div>
                        <span className="shrink-0 text-lg leading-none" aria-hidden>
                          {n.icon_emoji}
                        </span>
                      </div>
                      {!n.is_read ? (
                        <span className="mt-1 inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      ) : null}
                    </>
                  );

                  return (
                    <li key={n.id}>
                      {href ? (
                        <Link
                          href={href}
                          onClick={() => handleClick(n)}
                          className={cn(
                            'block px-3 py-2.5 transition-colors hover:bg-[#FFF0D4]/60',
                            !n.is_read && 'bg-[#FFF8ED]/90',
                          )}
                        >
                          {inner}
                        </Link>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            if (!n.is_read) void markRead([n.id]);
                          }}
                          className={cn(
                            'block w-full px-3 py-2.5 text-right transition-colors hover:bg-[#FFF0D4]/60',
                            !n.is_read && 'bg-[#FFF8ED]/90',
                          )}
                        >
                          {inner}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
