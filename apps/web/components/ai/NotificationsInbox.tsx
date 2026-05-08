'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, CheckCheck, Loader2 } from 'lucide-react';
import { useAlmogAvatarUrl } from '../../lib/client/useAlmogAvatarUrl';

type NotificationItem = {
  id: string;
  title: string;
  body: string;
  icon_emoji: string | null;
  action_url: string | null;
  is_read: boolean;
  created_at: string;
  type: string;
};

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'עכשיו';
  if (mins < 60) return `לפני ${mins} דק'`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `לפני ${hours} שעות`;
  const days = Math.floor(hours / 24);
  return `לפני ${days} ימים`;
}

export function NotificationsInbox() {
  const { avatarUrl: avatarSrc } = useAlmogAvatarUrl();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);

  const unreadCount = useMemo(() => items.filter((n) => !n.is_read).length, [items]);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/v1/notifications', { cache: 'no-store' });
      const data = (await res.json()) as { notifications?: NotificationItem[] };
      if (res.ok) setItems(data.notifications ?? []);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const markOne = useCallback(async (id: string) => {
    await fetch('/api/v1/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
  }, []);

  const markAll = useCallback(async () => {
    await fetch('/api/v1/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mark_all: true }),
    });
    setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
  }, []);

  if (!mounted) return null;

  return (
    <>
      <motion.button
        type="button"
        aria-label="התראות"
        className="fixed z-[190] flex h-12 w-12 items-center justify-center rounded-full text-white shadow-lg"
        style={{
          bottom: 'calc(11.2rem + env(safe-area-inset-bottom, 0px))',
          right: 'calc(1rem + env(safe-area-inset-right, 0px))',
          background: 'linear-gradient(145deg, #0f172a, #1e293b)',
        }}
        whileTap={{ scale: 0.94 }}
        onClick={() => setOpen((v) => !v)}
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-black leading-none">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[205] flex items-end justify-center p-0 sm:items-end sm:justify-end sm:p-4"
            style={{ background: 'rgba(15,23,42,0.35)' }}
            onClick={() => setOpen(false)}
          >
            <motion.div
              initial={{ y: 28, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              transition={{ type: 'spring', damping: 30, stiffness: 320 }}
              onClick={(e) => e.stopPropagation()}
              className="flex h-[min(72dvh,520px)] w-full max-w-md flex-col overflow-hidden rounded-t-3xl sm:rounded-3xl"
              style={{ background: '#fff', border: '1px solid rgba(15,23,42,0.08)' }}
              dir="rtl"
            >
              <div
                className="flex items-center justify-between px-4 py-3 text-white"
                style={{ background: 'linear-gradient(135deg, #0f172a, #1e293b)' }}
              >
                <div className="text-right">
                  <p className="text-sm font-black">הודעות</p>
                  <p className="text-[11px] text-white/80">נידג'ים ועדכונים מאלמוג</p>
                </div>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-2 py-1 text-xs font-bold"
                  onClick={() => void markAll()}
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  סמן הכל
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-3 space-y-2">
                {busy && (
                  <div className="flex items-center justify-center py-10 text-gray-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                )}
                {!busy && items.length === 0 && (
                  <p className="py-8 text-center text-sm text-gray-500">אין עדיין התראות.</p>
                )}
                {!busy &&
                  items.map((n) => {
                    const card = (
                      <div
                        className={`rounded-2xl border px-3 py-2.5 text-right ${n.is_read ? 'bg-white border-gray-200' : 'bg-emerald-50 border-emerald-200'}`}
                        onClick={() => void markOne(n.id)}
                      >
                        <div className="flex items-center justify-end gap-2">
                          {n.type === 'ai_message' ? (
                            <img src={avatarSrc} alt="אלמוג" className="h-7 w-7 rounded-lg object-cover border border-emerald-200" />
                          ) : (
                            <span>{n.icon_emoji ?? '🔔'}</span>
                          )}
                          <p className="text-sm font-black text-gray-900">{n.title}</p>
                        </div>
                        <p className="mt-1 text-sm leading-relaxed text-gray-700">{n.body}</p>
                        <p className="mt-1 text-[11px] text-gray-500">{timeAgo(n.created_at)}</p>
                      </div>
                    );

                    if (n.action_url) {
                      return (
                        <Link href={n.action_url} key={n.id} onClick={() => setOpen(false)}>
                          {card}
                        </Link>
                      );
                    }
                    return <div key={n.id}>{card}</div>;
                  })}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
