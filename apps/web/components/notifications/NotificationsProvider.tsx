'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { User } from '@supabase/supabase-js';
import Link from 'next/link';
import { Drawer } from 'vaul';
import { motion } from 'framer-motion';
import { CheckCheck, Loader2, Sparkles } from 'lucide-react';
import { createClient } from '../../lib/supabase/client';
import { useAlmogAvatarUrl } from '../../lib/client/useAlmogAvatarUrl';
import { ALMOG_AVATAR_FALLBACK } from '../../lib/ai/almog-avatar';

export type NotificationItem = {
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

function mapRealtimeRow(row: Record<string, unknown>): NotificationItem | null {
  const id = row.id;
  if (typeof id !== 'string') return null;
  return {
    id,
    title: typeof row.title === 'string' ? row.title : '',
    body: typeof row.body === 'string' ? row.body : '',
    icon_emoji: typeof row.icon_emoji === 'string' ? row.icon_emoji : null,
    action_url: typeof row.action_url === 'string' ? row.action_url : null,
    is_read: row.is_read === true,
    created_at: typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(),
    type: typeof row.type === 'string' ? row.type : 'system',
  };
}

type NotificationsDrawerContextValue = {
  open: () => void;
  close: () => void;
  unreadCount: number;
  isOpen: boolean;
};

const NotificationsDrawerContext = createContext<NotificationsDrawerContextValue | null>(null);

export function useNotificationsDrawer(): NotificationsDrawerContextValue {
  const ctx = useContext(NotificationsDrawerContext);
  if (!ctx) {
    throw new Error('NotificationsProvider חסר — עטוף את הלייאאוט ב-NotificationsProvider');
  }
  return ctx;
}

export function NotificationsProvider({
  userId,
  user: _user,
  children,
}: {
  userId: string;
  user: User;
  children: ReactNode;
}) {
  void _user;
  const { avatarUrl: almogAvatar } = useAlmogAvatarUrl();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);

  const unreadCount = useMemo(() => items.filter((n) => !n.is_read).length, [items]);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setBusy(true);
    try {
      const res = await fetch('/api/v1/notifications', { cache: 'no-store' });
      const data = (await res.json()) as { notifications?: NotificationItem[] };
      if (res.ok) setItems(data.notifications ?? []);
    } finally {
      if (!opts?.silent) setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** Realtime: הוספת התראה חדשה מיד כשהשרת מכניס שורה */
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`notifications-live-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const row = mapRealtimeRow(payload.new as Record<string, unknown>);
          if (!row) return;
          setItems((prev) => {
            if (prev.some((p) => p.id === row.id)) return prev;
            return [row, ...prev].slice(0, 30);
          });
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  /** גיבוי: ריענון שקט כשהטאב פעיל */
  useEffect(() => {
    const tick = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        void load({ silent: true });
      }
    };
    const id = window.setInterval(tick, 25000);
    const onVis = () => tick();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
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

  const ctxValue: NotificationsDrawerContextValue = useMemo(
    () => ({
      open: () => setOpen(true),
      close: () => setOpen(false),
      unreadCount,
      isOpen: open,
    }),
    [open, unreadCount]
  );

  return (
    <NotificationsDrawerContext.Provider value={ctxValue}>
      {children}

      <Drawer.Root open={open} onOpenChange={setOpen} direction="bottom" shouldScaleBackground>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 z-[240] bg-gradient-to-t from-fuchsia-950/50 via-emerald-950/35 to-slate-900/40 backdrop-blur-[3px]" />
          <Drawer.Content
            dir="rtl"
            className="fixed bottom-0 left-0 right-0 z-[250] mx-auto flex max-h-[88dvh] w-full max-w-md flex-col rounded-t-[28px] outline-none overflow-hidden"
            style={{
              border: '2px solid rgba(255,255,255,0.35)',
              boxShadow:
                '0 -28px 80px rgba(16,185,129,0.22), 0 -8px 40px rgba(192,38,211,0.12), inset 0 1px 0 rgba(255,255,255,0.5)',
              background:
                'linear-gradient(165deg, rgba(255,255,255,0.92) 0%, rgba(236,253,245,0.88) 35%, rgba(253,242,248,0.9) 70%, rgba(255,255,255,0.95) 100%)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
            }}
          >
            <Drawer.Title className="sr-only">התראות</Drawer.Title>
            <Drawer.Description className="sr-only">הודעות מאלמוג והמערכת</Drawer.Description>

            {/* מחוון מגירה — סגנון TikTok */}
            <div className="flex justify-center pt-2.5 pb-1 shrink-0">
              <div
                className="h-1.5 w-14 rounded-full"
                style={{
                  background:
                    'linear-gradient(90deg, #10b981, #d946ef, #f97316, #10b981)',
                  boxShadow: '0 2px 8px rgba(16,185,129,0.4)',
                }}
              />
            </div>

            {/* כותרת צבעונית */}
            <div
              className="relative shrink-0 px-4 pb-4 pt-2 overflow-hidden"
              style={{
                background:
                  'linear-gradient(125deg, #047857 0%, #10b981 35%, #a855f7 68%, #f97316 100%)',
              }}
            >
              <div
                className="absolute inset-0 opacity-30 pointer-events-none"
                style={{
                  backgroundImage:
                    'radial-gradient(circle at 20% 80%, white 0%, transparent 45%), radial-gradient(circle at 80% 20%, #fde68a 0%, transparent 40%)',
                }}
              />
              <div className="relative flex items-center gap-3">
                <motion.div
                  className="relative shrink-0"
                  initial={{ scale: 0.92 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 22 }}
                >
                  <div
                    className="rounded-2xl p-[2px]"
                    style={{
                      background: 'linear-gradient(135deg, #fff, #a7f3d0, #f0abfc)',
                      boxShadow: '0 8px 28px rgba(0,0,0,0.25)',
                    }}
                  >
                    <img
                      src={almogAvatar}
                      alt="אלמוג"
                      className="h-14 w-14 rounded-[14px] object-cover bg-emerald-900/20"
                      onError={(e) => {
                        e.currentTarget.onerror = null;
                        e.currentTarget.src = ALMOG_AVATAR_FALLBACK;
                      }}
                    />
                  </div>
                  <span className="absolute -bottom-1 -left-1 flex h-6 w-6 items-center justify-center rounded-full bg-white text-xs shadow-md border border-emerald-200">
                    🌿
                  </span>
                </motion.div>
                <div className="flex-1 min-w-0 text-right text-white">
                  <p className="flex items-center justify-end gap-1.5 text-lg font-black drop-shadow-sm" style={{ fontFamily: "'Rubik','Heebo',sans-serif" }}>
                    <Sparkles className="h-5 w-5 text-amber-200 shrink-0" />
                    התראות חיות
                  </p>
                  <p className="text-xs font-semibold text-white/90 mt-0.5">
                    מאלמוג והמערכת — נפתח למטה כמו בטיקטוק
                  </p>
                </div>
                <button
                  type="button"
                  className="shrink-0 inline-flex items-center gap-1 rounded-xl bg-white/20 px-2.5 py-1.5 text-xs font-black text-white border border-white/30 backdrop-blur-sm active:scale-95 transition-transform"
                  onClick={() => void markAll()}
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  הכל נקרא
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-8 pt-3 space-y-3 scrollbar-hide">
              {busy && items.length === 0 && (
                <div className="flex items-center justify-center py-16 text-emerald-700">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              )}
              {!busy && items.length === 0 && (
                <div className="py-12 text-center px-4">
                  <p className="text-4xl mb-3">✨</p>
                  <p className="text-sm font-bold text-emerald-900">אין התראות חדשות</p>
                  <p className="text-xs text-gray-600 mt-2 leading-relaxed">
                    כשאלמוג ישלח תזכורת או עדכון — זה יופיע כאן מיד (Realtime).
                  </p>
                </div>
              )}
              {items.map((n) => {
                const isAi = n.type === 'ai_message';
                const CardInner = (
                  <div
                    className={`relative overflow-hidden rounded-2xl p-[1px] transition-transform active:scale-[0.99] ${
                      n.is_read ? 'opacity-90' : ''
                    }`}
                    style={{
                      background: isAi
                        ? 'linear-gradient(135deg, #10b981, #d946ef, #f97316, #22d3ee)'
                        : 'linear-gradient(135deg, #94a3b8, #cbd5e1)',
                    }}
                  >
                    <div
                      className="rounded-[15px] px-3.5 py-3 text-right"
                      style={{
                        background: n.is_read
                          ? 'linear-gradient(180deg, rgba(255,255,255,0.92), rgba(248,250,252,0.95))'
                          : 'linear-gradient(180deg, rgba(255,255,255,0.98), rgba(236,253,245,0.75))',
                      }}
                    >
                      <div className="flex items-start gap-3 flex-row-reverse">
                        {isAi ? (
                          <img
                            src={almogAvatar}
                            alt=""
                            className="h-11 w-11 shrink-0 rounded-xl object-cover border-2 border-white shadow-md"
                            style={{ boxShadow: '0 4px 14px rgba(16,185,129,0.35)' }}
                            onError={(e) => {
                              e.currentTarget.onerror = null;
                              e.currentTarget.src = ALMOG_AVATAR_FALLBACK;
                            }}
                          />
                        ) : (
                          <span className="text-2xl shrink-0">{n.icon_emoji ?? '🔔'}</span>
                        )}
                        <div className="min-w-0 flex-1">
                          <p
                            className="text-sm font-black leading-tight text-transparent bg-clip-text"
                            style={{
                              backgroundImage: 'linear-gradient(90deg, #047857, #7c3aed, #ea580c)',
                              WebkitBackgroundClip: 'text',
                              backgroundClip: 'text',
                            }}
                          >
                            {n.title}
                          </p>
                          <p className="mt-1.5 text-[13px] leading-relaxed text-gray-800 font-medium">
                            {n.body}
                          </p>
                          <p className="mt-2 text-[11px] font-semibold text-gray-500">{timeAgo(n.created_at)}</p>
                        </div>
                      </div>
                      {!n.is_read && (
                        <span className="absolute top-2 left-2 h-2.5 w-2.5 rounded-full bg-gradient-to-br from-fuchsia-500 to-orange-400 shadow-sm" />
                      )}
                    </div>
                  </div>
                );

                if (n.action_url) {
                  return (
                    <Link
                      href={n.action_url}
                      key={n.id}
                      onClick={() => {
                        void markOne(n.id);
                        setOpen(false);
                      }}
                      className="block"
                    >
                      {CardInner}
                    </Link>
                  );
                }
                return (
                  <div key={n.id} className="block cursor-pointer" onClick={() => void markOne(n.id)}>
                    {CardInner}
                  </div>
                );
              })}
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </NotificationsDrawerContext.Provider>
  );
}
