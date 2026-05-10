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
import { CheckCheck, Loader2, Zap } from 'lucide-react';
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
  if (mins < 60) return `לפני ${mins} דק׳`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `לפני ${hours} שעות`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'אתמול';
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

  const glassShellStyle = {
    border: '1px solid rgba(255,255,255,0.52)',
    boxShadow:
      '0 -24px 64px rgba(6,78,59,0.14), 0 0 0 1px rgba(255,255,255,0.35) inset, inset 0 1px 0 rgba(255,255,255,0.65)',
    background:
      'linear-gradient(168deg, rgba(255,255,255,0.58) 0%, rgba(236,253,245,0.42) 42%, rgba(255,255,255,0.52) 100%)',
    backdropFilter: 'blur(26px) saturate(1.35)',
    WebkitBackdropFilter: 'blur(26px) saturate(1.35)',
  } as const;

  return (
    <NotificationsDrawerContext.Provider value={ctxValue}>
      {children}

      <Drawer.Root open={open} onOpenChange={setOpen} direction="bottom" shouldScaleBackground>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 z-[240] bg-emerald-950/38 backdrop-blur-[4px]" />
          <Drawer.Content
            dir="rtl"
            className="fixed bottom-0 left-0 right-0 z-[250] mx-auto flex max-h-[88dvh] w-full max-w-md flex-col rounded-t-[26px] outline-none overflow-hidden"
            style={glassShellStyle}
          >
            <Drawer.Title className="sr-only">התראות חיות</Drawer.Title>
            <Drawer.Description className="sr-only">
              עדכונים מאלמוג והמערכת בזמן אמת
            </Drawer.Description>

            <div className="flex justify-center pt-2.5 pb-1 shrink-0">
              <div
                className="h-1.5 w-12 rounded-full bg-white/55"
                style={{ boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.9)' }}
              />
            </div>

            {/* כותרת — מדרג טיל–אמרלד בלבד */}
            <div
              className="relative shrink-0 px-4 pb-4 pt-2 overflow-hidden"
              style={{
                background: 'linear-gradient(118deg, #0f766e 0%, #047857 38%, #059669 72%, #10b981 100%)',
                boxShadow: 'inset 0 -1px 0 rgba(0,0,0,0.06)',
              }}
            >
              <div
                className="pointer-events-none absolute inset-0 opacity-[0.14]"
                style={{
                  backgroundImage:
                    'radial-gradient(circle at 18% 85%, rgba(255,255,255,0.55) 0%, transparent 42%), radial-gradient(circle at 82% 15%, rgba(167,243,208,0.5) 0%, transparent 38%)',
                }}
              />
              <div className="relative flex items-start justify-between gap-3">
                <button
                  type="button"
                  className="shrink-0 inline-flex items-center gap-1 rounded-full bg-white/95 px-3 py-1.5 text-[11px] font-black text-emerald-900 shadow-md shadow-emerald-950/10 ring-1 ring-white/80 transition active:scale-[0.97]"
                  onClick={() => void markAll()}
                >
                  <CheckCheck className="h-3.5 w-3.5 text-emerald-700" strokeWidth={2.5} />
                  הכל נקרא
                </button>

                <div className="min-w-0 flex-1 text-right pr-0.5">
                  <div className="flex items-center justify-end gap-2">
                    <span className="relative flex h-2.5 w-2.5 shrink-0">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/70 opacity-75" />
                      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.9)]" />
                    </span>
                    <p
                      className="text-[17px] font-black text-white leading-tight drop-shadow-sm"
                      style={{ fontFamily: "'Rubik','Heebo',sans-serif" }}
                    >
                      התראות חיות
                    </p>
                  </div>
                  <p className="text-[11px] sm:text-xs font-semibold text-white/88 mt-1.5 leading-snug max-w-[240px] mr-auto">
                    מאלמוג המערכת — עדכון בזמן אמת
                  </p>
                </div>
              </div>
            </div>

            {/* גוף — שכבת זכוכית פנימית */}
            <div
              className="min-h-0 flex-1 overflow-y-auto px-3 sm:px-4 pb-10 pt-4 space-y-3 scrollbar-hide"
              style={{
                background:
                  'linear-gradient(180deg, rgba(255,255,255,0.28) 0%, rgba(236,253,245,0.22) 45%, rgba(255,255,255,0.26) 100%)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.45)',
              }}
            >
              {busy && items.length === 0 && (
                <div className="flex items-center justify-center py-16 text-teal-800">
                  <Loader2 className="h-8 w-8 animate-spin opacity-85" />
                </div>
              )}
              {!busy && items.length === 0 && (
                <div
                  className="py-14 text-center px-4 rounded-2xl mx-1"
                  style={{
                    border: '1px solid rgba(255,255,255,0.5)',
                    background: 'rgba(255,255,255,0.42)',
                    backdropFilter: 'blur(12px)',
                  }}
                >
                  <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500/25 to-emerald-500/20 ring-1 ring-emerald-600/15">
                    <span className="text-2xl" aria-hidden>
                      🌿
                    </span>
                  </div>
                  <p className="text-sm font-black text-emerald-950">אין התראות חדשות</p>
                  <p className="text-xs text-emerald-900/65 mt-2 leading-relaxed max-w-xs mx-auto font-medium">
                    כשאלמוג או המערכת ישלחו עדכון — יופיע כאן מיד (Realtime).
                  </p>
                </div>
              )}
              {items.map((n) => {
                const isAi = n.type === 'ai_message';
                const CardInner = (
                  <article
                    className={`relative overflow-hidden rounded-[18px] text-right transition-transform active:scale-[0.99] ${
                      n.is_read ? 'opacity-[0.94]' : ''
                    }`}
                    style={{
                      border: '1px solid rgba(255,255,255,0.62)',
                      background: n.is_read
                        ? 'linear-gradient(165deg, rgba(255,255,255,0.52) 0%, rgba(248,250,252,0.44) 100%)'
                        : 'linear-gradient(165deg, rgba(255,255,255,0.62) 0%, rgba(236,253,245,0.48) 100%)',
                      backdropFilter: 'blur(18px)',
                      WebkitBackdropFilter: 'blur(18px)',
                      boxShadow:
                        '0 10px 28px rgba(6,78,59,0.07), inset 0 1px 0 rgba(255,255,255,0.72)',
                    }}
                  >
                    {!n.is_read && (
                      <>
                        <span
                          className="absolute top-3 bottom-3 start-0 w-[3px] rounded-full bg-gradient-to-b from-teal-500 to-emerald-500 shadow-sm"
                          aria-hidden
                        />
                        <span
                          className="absolute top-3 start-2 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-white/90 shadow-sm"
                          aria-hidden
                        />
                      </>
                    )}
                    <div className="px-3.5 py-3.5 ps-5">
                      <div className="flex flex-row-reverse items-start gap-3">
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <div className="flex flex-row-reverse items-baseline justify-between gap-2">
                            <h4 className="text-[13px] font-black text-teal-800 leading-snug [overflow-wrap:anywhere]">
                              {n.title}
                            </h4>
                            <time
                              className="shrink-0 text-[10px] font-semibold text-slate-500 tabular-nums"
                              dateTime={n.created_at}
                            >
                              {timeAgo(n.created_at)}
                            </time>
                          </div>
                          <p className="text-[13px] leading-relaxed text-slate-800 font-medium [overflow-wrap:anywhere]">
                            {n.body}
                          </p>
                        </div>

                        <div className="shrink-0 pt-0.5">
                          {isAi ? (
                            <div
                              className="relative h-11 w-11 overflow-hidden rounded-full ring-2 ring-white shadow-md"
                              style={{ boxShadow: '0 4px 14px rgba(4,120,87,0.22)' }}
                            >
                              <img
                                src={almogAvatar}
                                alt=""
                                className="h-full w-full object-cover bg-teal-900/15"
                                onError={(e) => {
                                  e.currentTarget.onerror = null;
                                  e.currentTarget.src = ALMOG_AVATAR_FALLBACK;
                                }}
                              />
                            </div>
                          ) : (
                            <div
                              className="flex h-11 w-11 items-center justify-center rounded-full text-xl shadow-inner leading-none"
                              style={{
                                background: 'linear-gradient(145deg, rgba(13,148,136,0.18), rgba(16,185,129,0.22))',
                                border: '1px solid rgba(255,255,255,0.65)',
                                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.8)',
                              }}
                            >
                              {n.icon_emoji ? (
                                <span aria-hidden>{n.icon_emoji}</span>
                              ) : (
                                <Zap className="h-5 w-5 text-teal-700" strokeWidth={2.2} aria-hidden />
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </article>
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
                      className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/50 rounded-[18px]"
                    >
                      {CardInner}
                    </Link>
                  );
                }
                return (
                  <div
                    key={n.id}
                    role="button"
                    tabIndex={0}
                    className="block cursor-pointer rounded-[18px] focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/50"
                    onClick={() => void markOne(n.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        void markOne(n.id);
                      }
                    }}
                  >
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
