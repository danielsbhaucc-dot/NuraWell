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
import { Archive, ArchiveRestore, CheckCheck, ChevronDown, Loader2, Zap } from 'lucide-react';
import { createClient } from '../../lib/supabase/client';
import { useAlmogAvatarUrl } from '../../lib/client/useAlmogAvatarUrl';
import { ALMOG_AVATAR_FALLBACK } from '../../lib/ai/almog-avatar';
import { formatHebrewRelativeTime } from '../../lib/time/hebrew-relative';
import { cn } from '../../lib/cn';

export type NotificationItem = {
  id: string;
  title: string;
  body: string;
  icon_emoji: string | null;
  action_url: string | null;
  is_read: boolean;
  created_at: string;
  type: string;
  archived_at: string | null;
  /** מקור — להבחנה בעיצוב (almog_habit_checkpoint וכו') */
  source: string | null;
};

type ViewMode = 'inbox' | 'archive';
type FilterKind = 'all' | 'unread' | 'almog';

function extractSource(meta: unknown): string | null {
  if (!meta || typeof meta !== 'object') return null;
  const s = (meta as { source?: unknown }).source;
  return typeof s === 'string' && s.length > 0 ? s : null;
}

function mapRealtimeRow(row: Record<string, unknown>): NotificationItem | null {
  const id = row.id;
  if (typeof id !== 'string') return null;
  const archived =
    row.archived_at != null && typeof row.archived_at === 'string' ? row.archived_at : null;
  return {
    id,
    title: typeof row.title === 'string' ? row.title : '',
    body: typeof row.body === 'string' ? row.body : '',
    icon_emoji: typeof row.icon_emoji === 'string' ? row.icon_emoji : null,
    action_url: typeof row.action_url === 'string' ? row.action_url : null,
    is_read: row.is_read === true,
    created_at: typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(),
    type: typeof row.type === 'string' ? row.type : 'system',
    archived_at: archived,
    source: extractSource(row.metadata),
  };
}

/** מיפוי שורה מ-API (כולל metadata) לטיפוס NotificationItem */
function mapApiRow(row: Record<string, unknown>): NotificationItem {
  return {
    id: String(row.id ?? ''),
    title: typeof row.title === 'string' ? row.title : '',
    body: typeof row.body === 'string' ? row.body : '',
    icon_emoji: typeof row.icon_emoji === 'string' ? row.icon_emoji : null,
    action_url: typeof row.action_url === 'string' ? row.action_url : null,
    is_read: row.is_read === true,
    created_at: typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(),
    type: typeof row.type === 'string' ? row.type : 'system',
    archived_at:
      row.archived_at != null && typeof row.archived_at === 'string' ? row.archived_at : null,
    source: extractSource(row.metadata),
  };
}

function buildListUrl(opts: {
  viewMode: ViewMode;
  filterKind: FilterKind;
  cursor: string | null;
  limit?: number;
}): string {
  const params = new URLSearchParams();
  params.set('limit', String(opts.limit ?? 40));
  if (opts.viewMode === 'archive') params.set('archived', '1');
  const fk = opts.viewMode === 'archive' ? 'all' : opts.filterKind;
  if (fk === 'unread') params.set('unread_only', '1');
  if (fk === 'almog') params.set('types', 'ai_message');
  if (opts.cursor) params.set('cursor', opts.cursor);
  return `/api/v1/notifications?${params.toString()}`;
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

const HEADER_GRADIENT =
  'linear-gradient(118deg, #0f766e 0%, #047857 38%, #059669 72%, #10b981 100%)';

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
  const [loadingMore, setLoadingMore] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('inbox');
  const [filterKind, setFilterKind] = useState<FilterKind>('all');
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [timeTick, setTimeTick] = useState(0);

  const filterKey = `${viewMode}-${filterKind}`;

  const loadInitial = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!opts?.silent) setBusy(true);
      try {
        const url = buildListUrl({
          viewMode,
          filterKind,
          cursor: null,
          limit: 40,
        });
        const res = await fetch(url, { cache: 'no-store' });
        const data = (await res.json()) as {
          notifications?: Array<Record<string, unknown>>;
          next_cursor?: string | null;
          unread_total?: number;
        };
        if (!res.ok) return;
        const list = (data.notifications ?? []).map(mapApiRow);
        if (typeof data.unread_total === 'number') setUnreadTotal(data.unread_total);
        setNextCursor(data.next_cursor ?? null);
        setItems(list);
      } finally {
        setBusy(false);
      }
    },
    [filterKind, viewMode]
  );

  const loadMore = useCallback(async () => {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const url = buildListUrl({
        viewMode,
        filterKind,
        cursor: nextCursor,
        limit: 40,
      });
      const res = await fetch(url, { cache: 'no-store' });
      const data = (await res.json()) as {
        notifications?: Array<Record<string, unknown>>;
        next_cursor?: string | null;
        unread_total?: number;
      };
      if (!res.ok) return;
      const list = (data.notifications ?? []).map(mapApiRow);
      if (typeof data.unread_total === 'number') setUnreadTotal(data.unread_total);
      setNextCursor(data.next_cursor ?? null);
      setItems((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        const merged = [...prev];
        for (const n of list) {
          if (!seen.has(n.id)) merged.push(n);
        }
        return merged;
      });
    } finally {
      setLoadingMore(false);
    }
  }, [filterKind, nextCursor, viewMode]);

  useEffect(() => {
    void loadInitial();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- טעינה כשמשנים טאב/פילטר
  }, [filterKey]);

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
          if (!row || row.archived_at) return;
          if (viewMode === 'archive') return;
          if (filterKind === 'unread' && row.is_read) return;
          if (filterKind === 'almog' && row.type !== 'ai_message') return;
          setItems((prev) => {
            if (prev.some((p) => p.id === row.id)) return prev;
            return [row, ...prev];
          });
          if (!row.is_read) setUnreadTotal((u) => u + 1);
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, viewMode, filterKind]);

  useEffect(() => {
    const tick = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        void loadInitial({ silent: true });
      }
    };
    const id = window.setInterval(tick, 25000);
    const onVis = () => tick();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [loadInitial]);

  useEffect(() => {
    if (!open) return;
    setTimeTick((t) => t + 1);
    const id = window.setInterval(() => setTimeTick((t) => t + 1), 15_000);
    return () => window.clearInterval(id);
  }, [open]);

  const markOne = useCallback(
    async (id: string, wasUnread: boolean) => {
      await fetch('/api/v1/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      setItems((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
      if (wasUnread) setUnreadTotal((u) => Math.max(0, u - 1));
    },
    []
  );

  const markAll = useCallback(async () => {
    await fetch('/api/v1/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mark_all: true }),
    });
    setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadTotal(0);
  }, []);

  const archiveOne = useCallback(async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    await fetch('/api/v1/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archive_id: id }),
    });
    setItems((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const unarchiveOne = useCallback(async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    await fetch('/api/v1/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ unarchive_id: id }),
    });
    setItems((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const ctxValue: NotificationsDrawerContextValue = useMemo(
    () => ({
      open: () => setOpen(true),
      close: () => setOpen(false),
      unreadCount: unreadTotal,
      isOpen: open,
    }),
    [open, unreadTotal]
  );

  const nowMs = useMemo(() => Date.now(), [timeTick, open]);

  const glassBodyStyle = {
    background:
      'linear-gradient(180deg, rgba(255,255,255,0.32) 0%, rgba(236,253,245,0.24) 45%, rgba(255,255,255,0.3) 100%)',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.5)',
  } as const;

  const showMarkAll = viewMode === 'inbox' && items.some((n) => !n.is_read);

  return (
    <NotificationsDrawerContext.Provider value={ctxValue}>
      {children}

      <Drawer.Root open={open} onOpenChange={setOpen} direction="bottom" shouldScaleBackground>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 z-[240] bg-emerald-950/38 backdrop-blur-[4px]" />
          <Drawer.Content
            dir="rtl"
            className="fixed bottom-0 left-0 right-0 z-[250] mx-auto flex max-h-[88dvh] w-full max-w-md flex-col rounded-t-[26px] outline-none overflow-hidden"
            style={{
              border: '1px solid rgba(255,255,255,0.52)',
              boxShadow:
                '0 -24px 64px rgba(6,78,59,0.14), 0 0 0 1px rgba(255,255,255,0.35) inset, inset 0 1px 0 rgba(255,255,255,0.65)',
              background:
                'linear-gradient(168deg, rgba(255,255,255,0.58) 0%, rgba(236,253,245,0.42) 42%, rgba(255,255,255,0.52) 100%)',
              backdropFilter: 'blur(26px) saturate(1.35)',
              WebkitBackdropFilter: 'blur(26px) saturate(1.35)',
            }}
          >
            <Drawer.Title className="sr-only">התראות</Drawer.Title>
            <Drawer.Description className="sr-only">רשימת התראות עם סינון וארכיון</Drawer.Description>

            <div
              className="relative shrink-0 overflow-hidden rounded-t-[26px]"
              style={{
                background: HEADER_GRADIENT,
                boxShadow: 'inset 0 -1px 0 rgba(0,0,0,0.06)',
              }}
            >
              <div
                className="pointer-events-none absolute inset-0 opacity-[0.14]"
                style={{
                  backgroundImage:
                    'radial-gradient(circle at 18% 95%, rgba(255,255,255,0.5) 0%, transparent 45%), radial-gradient(circle at 82% 10%, rgba(167,243,208,0.45) 0%, transparent 38%)',
                }}
                aria-hidden
              />
              <div className="relative z-[1]">
                <div className="flex justify-center pt-2.5 pb-2">
                  <div
                    className="h-1.5 w-12 rounded-full"
                    style={{
                      background:
                        'linear-gradient(90deg, rgba(255,255,255,0.45), rgba(167,243,208,0.85), rgba(255,255,255,0.5))',
                      boxShadow: '0 1px 8px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.55)',
                    }}
                  />
                </div>

                <div className="relative flex items-start justify-between gap-2 px-3 pb-3 pt-1 sm:px-4">
                  {showMarkAll ? (
                    <button
                      type="button"
                      className="shrink-0 inline-flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-1.5 text-[11px] font-black text-emerald-900 shadow-md shadow-emerald-950/10 ring-1 ring-white/80 transition active:scale-[0.97]"
                      onClick={() => void markAll()}
                    >
                      <CheckCheck className="h-3.5 w-3.5 text-emerald-700" strokeWidth={2.5} />
                      הכל נקרא
                    </button>
                  ) : (
                    <span className="w-16 shrink-0" aria-hidden />
                  )}

                  <div className="min-w-0 flex-1 text-right pe-0.5">
                    <div className="flex items-center justify-end gap-2 flex-wrap">
                      <span className="relative flex h-2.5 w-2.5 shrink-0">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/70 opacity-75" />
                        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.9)]" />
                      </span>
                      <h2
                        className="text-[18px] sm:text-[19px] font-black text-white leading-tight drop-shadow-sm tracking-tight"
                        style={{ fontFamily: "'Rubik','Heebo',sans-serif" }}
                      >
                        התראות
                      </h2>
                    </div>
                  </div>
                </div>

                {/* טאב תיבה / ארכיון */}
                <div className="flex justify-center gap-1 px-3 pb-3">
                  <button
                    type="button"
                    onClick={() => {
                      setViewMode('inbox');
                      setFilterKind('all');
                    }}
                    className={cn(
                      'rounded-full px-4 py-1.5 text-xs font-black transition',
                      viewMode === 'inbox'
                        ? 'bg-white text-emerald-900 shadow'
                        : 'bg-white/15 text-white hover:bg-white/25'
                    )}
                  >
                    תיבה
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setViewMode('archive');
                      setFilterKind('all');
                    }}
                    className={cn(
                      'rounded-full px-4 py-1.5 text-xs font-black transition',
                      viewMode === 'archive'
                        ? 'bg-white text-emerald-900 shadow'
                        : 'bg-white/15 text-white hover:bg-white/25'
                    )}
                  >
                    ארכיון
                  </button>
                </div>

                {viewMode === 'inbox' && (
                  <div className="flex flex-wrap justify-center gap-1.5 px-3 pb-3">
                    {(
                      [
                        ['all', 'הכל'],
                        ['unread', 'לא נקראו'],
                        ['almog', 'מאלמוג'],
                      ] as const
                    ).map(([k, label]) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setFilterKind(k)}
                        className={cn(
                          'rounded-full px-3 py-1 text-[11px] font-bold transition',
                          filterKind === k
                            ? 'bg-emerald-950/25 text-white ring-1 ring-white/40'
                            : 'bg-white/10 text-white/90 hover:bg-white/20'
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div
              className="min-h-0 flex-1 overflow-y-auto px-3 sm:px-4 pb-10 pt-4 space-y-3.5 scrollbar-hide text-right"
              style={glassBodyStyle}
            >
              {busy && items.length === 0 && (
                <div className="flex items-center justify-center py-16 text-teal-800">
                  <Loader2 className="h-8 w-8 animate-spin opacity-85" />
                </div>
              )}
              {!busy && items.length === 0 && (
                <div
                  className="py-14 text-center px-4 rounded-[20px] mx-0.5"
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
                  <p
                    className="text-sm font-black text-emerald-950"
                    style={{ fontFamily: "'Rubik','Heebo',sans-serif" }}
                  >
                    {viewMode === 'archive' ? 'הארכיון ריק' : 'אין התראות להצגה'}
                  </p>
                  <p className="text-xs text-emerald-900/65 mt-2 leading-relaxed max-w-xs mx-auto font-medium">
                    {viewMode === 'archive'
                      ? 'התראות שתעבירו לארכיון יופיעו כאן.'
                      : 'נסו לשנות את הסינון או לחזור מאוחר יותר.'}
                  </p>
                </div>
              )}
              {items.map((n) => {
                const isAi = n.type === 'ai_message';
                const isCheckpoint = n.source === 'almog_habit_checkpoint';
                const relative = formatHebrewRelativeTime(n.created_at, nowMs);

                const ArchiveBtn =
                  viewMode === 'inbox' ? (
                    <button
                      type="button"
                      title="העבר לארכיון"
                      className="absolute bottom-2 start-2 z-10 inline-flex h-8 w-8 items-center justify-center rounded-xl bg-white/90 text-emerald-800 shadow-md ring-1 ring-emerald-100 transition hover:bg-white"
                      onClick={(e) => void archiveOne(n.id, e)}
                    >
                      <Archive className="h-4 w-4" aria-hidden />
                    </button>
                  ) : (
                    <button
                      type="button"
                      title="החזר לתיבה"
                      className="absolute bottom-2 start-2 z-10 inline-flex h-8 w-8 items-center justify-center rounded-xl bg-white/90 text-teal-800 shadow-md ring-1 ring-teal-100 transition hover:bg-white"
                      onClick={(e) => void unarchiveOne(n.id, e)}
                    >
                      <ArchiveRestore className="h-4 w-4" aria-hidden />
                    </button>
                  );

                /**
                 * עיצוב מיוחד להתראות habit-checkpoint:
                 * - גרדיאנט אמבר-עמוק בקצה הימני (במקום הירוק הסטנדרטי) — מעיד "תובנה אישית".
                 * - תווית "תובנה" קטנה מעל הכותרת.
                 * - שאר העיצוב נשאר זהה כדי להתמזג עם הממשק.
                 */
                const cardBg = isCheckpoint
                  ? n.is_read
                    ? 'linear-gradient(165deg, rgba(255,255,255,0.62) 0%, rgba(254,243,199,0.30) 100%)'
                    : 'linear-gradient(165deg, rgba(255,255,255,0.72) 0%, rgba(254,243,199,0.50) 65%, rgba(255,237,213,0.45) 100%)'
                  : n.is_read
                    ? 'linear-gradient(165deg, rgba(255,255,255,0.55) 0%, rgba(248,250,252,0.42) 100%)'
                    : 'linear-gradient(165deg, rgba(255,255,255,0.65) 0%, rgba(236,253,245,0.5) 100%)';
                const cardShadow = isCheckpoint
                  ? '0 12px 32px rgba(180,83,9,0.10), inset 0 1px 0 rgba(255,255,255,0.78)'
                  : '0 12px 32px rgba(6,78,59,0.08), inset 0 1px 0 rgba(255,255,255,0.78)';
                const cardBorder = isCheckpoint
                  ? '1px solid rgba(252,211,77,0.45)'
                  : '1px solid rgba(255,255,255,0.68)';
                const stripGradient = isCheckpoint
                  ? 'bg-gradient-to-b from-amber-400 to-orange-400'
                  : 'bg-gradient-to-b from-teal-500 to-emerald-500';
                const dotColor = isCheckpoint ? 'bg-amber-500' : 'bg-emerald-500';

                const CardInner = (
                  <article
                    className={`relative overflow-hidden rounded-[20px] text-right transition-transform active:scale-[0.99] ${
                      n.is_read ? 'opacity-[0.93]' : ''
                    }`}
                    style={{
                      border: cardBorder,
                      background: cardBg,
                      backdropFilter: 'blur(20px)',
                      WebkitBackdropFilter: 'blur(20px)',
                      boxShadow: cardShadow,
                    }}
                    lang="he"
                  >
                    {ArchiveBtn}
                    {!n.is_read && (
                      <>
                        <span
                          className={`absolute top-3 bottom-3 start-0 w-[3px] rounded-full shadow-sm ${stripGradient}`}
                          aria-hidden
                        />
                        <span
                          className={`absolute top-3.5 start-2.5 h-2 w-2 rounded-full ${dotColor} ring-2 ring-white/95 shadow-sm`}
                          aria-hidden
                        />
                      </>
                    )}
                    <div className="px-4 py-4 ps-5 pb-12">
                      <div className="flex flex-row-reverse items-start gap-3">
                        <div className="min-w-0 flex-1 space-y-2">
                          {isCheckpoint ? (
                            <span
                              className="inline-flex items-center gap-1 rounded-full px-2 py-[2px] text-[10px] font-black tracking-wide text-amber-900 shadow-sm"
                              style={{
                                background:
                                  'linear-gradient(135deg, rgba(252,211,77,0.85), rgba(251,191,36,0.7))',
                                border: '1px solid rgba(252,211,77,0.6)',
                              }}
                            >
                              <span className="text-[10px]" aria-hidden>✨</span>
                              תובנה רגע
                            </span>
                          ) : null}
                          <div className="flex flex-row items-baseline justify-between gap-3 w-full">
                            <h3
                              className={`text-[14px] sm:text-[15px] font-black leading-snug [overflow-wrap:anywhere] break-words text-right flex-1 min-w-0 order-1 ${
                                isCheckpoint ? 'text-amber-950' : 'text-teal-900'
                              }`}
                              style={{ fontFamily: "'Rubik','Heebo',sans-serif" }}
                            >
                              {n.title}
                            </h3>
                            <time
                              className="order-2 shrink-0 text-[10px] sm:text-[11px] font-semibold text-slate-500 tabular-nums whitespace-nowrap"
                              dateTime={n.created_at}
                              title={new Date(n.created_at).toLocaleString('he-IL', {
                                timeZone: 'Asia/Jerusalem',
                              })}
                            >
                              {relative}
                            </time>
                          </div>
                          <p className="text-[13px] sm:text-[14px] leading-relaxed text-slate-800 font-medium [overflow-wrap:anywhere] break-words text-right">
                            {n.body}
                          </p>
                        </div>

                        <div className={`shrink-0 pt-0.5 ${isAi ? 'pb-2' : ''}`}>
                          {isAi ? (
                            <div className="relative inline-block">
                              <div
                                className="relative h-12 w-12 overflow-hidden rounded-full ring-2 ring-white shadow-md"
                                style={{ boxShadow: '0 4px 16px rgba(4,120,87,0.22)' }}
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
                              <span
                                className="absolute -bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-2 py-0.5 text-[9px] font-black text-white shadow-md"
                                style={{
                                  background: 'linear-gradient(135deg, #047857, #10b981)',
                                  boxShadow: '0 2px 8px rgba(4,120,87,0.35)',
                                  letterSpacing: '0.02em',
                                }}
                              >
                                אלמוג
                              </span>
                            </div>
                          ) : (
                            <div
                              className="flex h-12 w-12 items-center justify-center rounded-full text-xl shadow-inner leading-none"
                              style={{
                                background:
                                  'linear-gradient(145deg, rgba(13,148,136,0.2), rgba(16,185,129,0.24))',
                                border: '1px solid rgba(255,255,255,0.7)',
                                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.85)',
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
                        void markOne(n.id, !n.is_read);
                        setOpen(false);
                      }}
                      className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/50 rounded-[20px]"
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
                    className="block cursor-pointer rounded-[20px] focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/50"
                    onClick={() => void markOne(n.id, !n.is_read)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        void markOne(n.id, !n.is_read);
                      }
                    }}
                  >
                    {CardInner}
                  </div>
                );
              })}

              {nextCursor ? (
                <div className="flex justify-center pt-2 pb-6">
                  <button
                    type="button"
                    disabled={loadingMore}
                    onClick={() => void loadMore()}
                    className="inline-flex items-center gap-2 rounded-2xl border border-emerald-200/80 bg-white/80 px-5 py-2.5 text-sm font-bold text-emerald-900 shadow-sm transition hover:bg-white disabled:opacity-50"
                  >
                    {loadingMore ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ChevronDown className="h-4 w-4" aria-hidden />
                    )}
                    טען עוד
                  </button>
                </div>
              ) : null}
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </NotificationsDrawerContext.Provider>
  );
}
