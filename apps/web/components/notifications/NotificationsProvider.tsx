'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { RealtimeChannel, User } from '@supabase/supabase-js';
import { Drawer } from 'vaul';
import { CheckCheck, ChevronDown, Loader2 } from 'lucide-react';
import { NotificationCard } from './NotificationCard';
import { LiveToastStack } from './LiveNotificationToast';
import {
  extractExpectsReply,
  extractSource,
  extractSurvey,
  type NotificationSurvey,
} from '../../lib/notifications/replyable';
import { createClient } from '../../lib/supabase/client';
import { useAlmogAvatarUrl } from '../../lib/client/useAlmogAvatarUrl';
import { useMentorAvatarUrl } from '../../lib/client/useMentorAvatarUrl';
import type { MentorId } from '../../lib/mentors/registry';
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
  mentorId: MentorId;
  /** האם ניתן להגיב דרך הצ'אט (הודעות מאלמוג עם שאלה) */
  expectsReply?: boolean;
  /** סקר Exit (מערכת הנטישה — מהלך breakup). null כשאין. */
  survey?: NotificationSurvey | null;
};

type ViewMode = 'inbox' | 'archive';
type FilterKind = 'all' | 'unread' | 'almog';

function extractMentor(meta: unknown, title: string): MentorId {
  if (meta && typeof meta === 'object') {
    const m = (meta as { mentor?: unknown }).mentor;
    if (m === 'dolev' || m === 'almog') return m;
    const src = (meta as { source?: unknown }).source;
    if (src === 'dolev_welcome') return 'dolev';
  }
  if (title.includes('מדולב')) return 'dolev';
  return 'almog';
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
    mentorId: extractMentor(row.metadata, typeof row.title === 'string' ? row.title : ''),
    expectsReply: extractExpectsReply(row.metadata),
    survey: extractSurvey(row.metadata),
  };
}

/** מיפוי שורה מ-API (כולל metadata) לטיפוס NotificationItem */
function mapApiRow(row: Record<string, unknown>): NotificationItem {
  const title = typeof row.title === 'string' ? row.title : '';
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
    mentorId: extractMentor(row.metadata, title),
    expectsReply: extractExpectsReply(row.metadata),
    survey: extractSurvey(row.metadata),
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
  const { avatarUrl: dolevAvatar } = useMentorAvatarUrl('dolev');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('inbox');
  const [filterKind, setFilterKind] = useState<FilterKind>('all');
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [timeTick, setTimeTick] = useState(0);
  /**
   * 🔔 Live toast queue — כל התראה חדשה שמגיעה דרך realtime/SW כשהמסך
   * פעיל ב-foreground נדחפת לכאן ומופיעה כ-toast קופץ מעל הכל.
   * ה-stack מציג עד 3 — הישנים יוצאים אוטומטית או כשהמשתמש סוגר.
   */
  const [liveToasts, setLiveToasts] = useState<NotificationItem[]>([]);

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

  /**
   * 🚀 דחיפה ל-live toast queue — נקרא ע"י realtime ו-SW כש-INSERT מתקבל
   * והאפליקציה פעילה ב-foreground. הגנה מפני duplicate (אותו id כבר ב-toast
   * או ב-items).
   */
  const enqueueToast = useCallback((row: NotificationItem) => {
    if (row.archived_at || row.is_read) return;
    setLiveToasts((prev) => {
      if (prev.some((p) => p.id === row.id)) return prev;
      // החדש בראש; הישן מאחור (FIFO על המסך)
      return [row, ...prev].slice(0, 6);
    });
  }, []);

  const dismissToast = useCallback((id: string) => {
    setLiveToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  /**
   * 📡 Realtime עמיד-לחיים — מאזין ל-INSERT-ים על `notifications` של המשתמש.
   *
   * 🐛 הבאג שתוקן כאן: ה-channel נסגר אחרי תקופות ארוכות של idle (טאב ברקע,
   * שינוי רשת, sleep). הקוד הישן רק יצר channel פעם אחת ב-mount; כשהיא
   * נסגרה, ה-UI לא קיבל יותר התראות חיות גם כשהמשתמש חזר לטאב — *זאת*
   * הסיבה שהמסך נשאר פתוח שעה ולא התעדכן.
   *
   * הפתרון:
   *  1. עוקבים אחרי `status` של ה-channel; ב-CLOSED/CHANNEL_ERROR/TIMED_OUT
   *     מתזמנים reconnect עם backoff.
   *  2. ב-`visibilitychange` (hidden→visible) → מצרכים `loadInitial` *וגם*
   *     מאלצים reconnect של הchannel אם הוא לא SUBSCRIBED.
   *  3. ב-`online` (חזרה לרשת) → reconnect.
   *  4. שמירת `latestFiltersRef` כדי שהקלוז'ר של ה-callback יראה תמיד את
   *     הפילטרים המעודכנים בלי לעקור את ה-channel בכל שינוי פילטר (יקר!).
   *  5. heartbeat — אחת ל-5 דקות בודקים שה-channel באמת חי; אם לא, מחדשים.
   */
  const channelRef = useRef<RealtimeChannel | null>(null);
  const channelStatusRef = useRef<string>('IDLE');
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef(0);
  const latestFiltersRef = useRef({ viewMode, filterKind });

  useEffect(() => {
    latestFiltersRef.current = { viewMode, filterKind };
  }, [viewMode, filterKind]);

  /** Stable callback — נשמר באותו closure ב-Realtime callback. */
  const handleRealtimeInsert = useCallback(
    (newRow: Record<string, unknown>) => {
      const row = mapRealtimeRow(newRow);
      if (!row || row.archived_at) return;

      const { viewMode: vm, filterKind: fk } = latestFiltersRef.current;
      const matchesFilter =
        vm !== 'archive' &&
        !(fk === 'unread' && row.is_read) &&
        !(fk === 'almog' && row.type !== 'ai_message');
      if (matchesFilter) {
        setItems((prev) => {
          if (prev.some((p) => p.id === row.id)) return prev;
          return [row, ...prev];
        });
      }
      if (!row.is_read) setUnreadTotal((u) => u + 1);

      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        enqueueToast(row);
      }
    },
    [enqueueToast]
  );

  useEffect(() => {
    const supabase = createClient();
    let teardown = false;

    const cleanupChannel = () => {
      const ch = channelRef.current;
      if (ch) {
        void supabase.removeChannel(ch);
        channelRef.current = null;
      }
    };

    const scheduleReconnect = (reason: string) => {
      if (teardown) return;
      if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current);
      reconnectAttemptRef.current += 1;
      /** Exponential backoff עם תקרה — מתחיל ב-2s ועד 30s. */
      const delay = Math.min(2000 * Math.pow(1.6, reconnectAttemptRef.current - 1), 30_000);
      console.warn(
        `[notifications-realtime] scheduling reconnect (${reason}) attempt=${reconnectAttemptRef.current} delay=${Math.round(delay)}ms`
      );
      reconnectTimerRef.current = window.setTimeout(() => {
        if (teardown) return;
        connect();
      }, delay);
    };

    const connect = () => {
      if (teardown) return;
      cleanupChannel();

      const channel = supabase
        .channel(`notifications-live-${userId}-${Date.now()}`, {
          config: { broadcast: { ack: false }, presence: { key: '' } },
        })
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${userId}`,
          },
          (payload) => {
            handleRealtimeInsert(payload.new as Record<string, unknown>);
          }
        )
        .subscribe((status, err) => {
          channelStatusRef.current = status;
          if (status === 'SUBSCRIBED') {
            reconnectAttemptRef.current = 0;
            /**
             * אחרי חיבור-מחדש — סנכרון מצב כדי לא לפספס INSERT-ים שהתרחשו
             * בזמן שהיינו offline / channel סגור.
             */
            void loadInitial({ silent: true });
          } else if (
            status === 'CHANNEL_ERROR' ||
            status === 'TIMED_OUT' ||
            status === 'CLOSED'
          ) {
            if (err) {
              console.warn('[notifications-realtime] channel error:', err);
            }
            scheduleReconnect(status);
          }
        });

      channelRef.current = channel;
    };

    connect();

    /** visibility — חזרה לטאב: רענון + ודא שה-channel חי. */
    const onVis = () => {
      if (typeof document === 'undefined' || document.visibilityState !== 'visible') return;
      void loadInitial({ silent: true });
      if (channelStatusRef.current !== 'SUBSCRIBED') {
        console.info('[notifications-realtime] tab visible — forcing reconnect');
        reconnectAttemptRef.current = 0;
        connect();
      }
    };

    /** online — חזרה לרשת: reconnect מיידי. */
    const onOnline = () => {
      console.info('[notifications-realtime] back online — forcing reconnect');
      reconnectAttemptRef.current = 0;
      connect();
    };

    /** heartbeat — אחת ל-5 דקות מאמת שה-channel SUBSCRIBED. */
    const heartbeat = window.setInterval(() => {
      if (
        channelStatusRef.current !== 'SUBSCRIBED' &&
        typeof document !== 'undefined' &&
        document.visibilityState === 'visible'
      ) {
        console.warn(
          '[notifications-realtime] heartbeat detected non-subscribed channel, reconnecting'
        );
        reconnectAttemptRef.current = 0;
        connect();
      }
    }, 300_000);

    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('online', onOnline);

    return () => {
      teardown = true;
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('online', onOnline);
      if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current);
      window.clearInterval(heartbeat);
      cleanupChannel();
    };
  }, [userId, handleRealtimeInsert, loadInitial]);

  /**
   * 📨 גשר Service Worker → חלון. ה-SW שולח postMessage כש-push מתקבל
   * והוא מזהה client visible. אנחנו מאזינים פה ומציגים toast. זה משלים
   * את ה-realtime למקרה שה-INSERT ל-DB טרם הסתנכרן (push לפני realtime).
   */
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    const handleMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== 'object') return;
      if ((data as { type?: string }).type !== 'live-notification') return;
      const payload = (data as { payload?: Record<string, unknown> }).payload;
      if (!payload) return;
      const row = mapRealtimeRow(payload);
      if (!row) return;
      enqueueToast(row);
    };

    navigator.serviceWorker.addEventListener('message', handleMessage);
    return () => {
      navigator.serviceWorker.removeEventListener('message', handleMessage);
    };
  }, [enqueueToast]);

  /**
   * 🔄 רענון רקע חכם (חיסכון Egress) — Realtime הוא הערוץ הראשי לעדכונים
   * חיים, ולכן אין צורך ב-polling אגרסיבי. הקוד הישן שלף 40 התראות + count
   * כל 25 שניות *לכל משתמש מחובר* — מקור עיקרי ל-Egress גבוה ב-Supabase.
   *
   * האסטרטגיה החדשה (מינימום משאבים, מקסימום איכות):
   *  • Realtime בריא (SUBSCRIBED) → סנכרון רקע איטי בלבד, אחת ל-5 דקות
   *    (כדי לקלוט מצב read/archive שבוצע במכשיר אחר; התראות חדשות ממילא
   *    מגיעות חי דרך ה-channel + toast).
   *  • Realtime לא בריא → polling fallback כל 30ש' כדי לא לפספס עדכונים.
   *  • רק כשהטאב גלוי. רענון מיידי בחזרה לטאב כבר מטופל ב-effect של Realtime
   *    (visibilitychange שם קורא ל-loadInitial), כך שאין צורך בכפילות כאן.
   *
   * תוצאה: כש-Realtime תקין, השליפות יורדות מ-~144 לשעה לכל משתמש ל-~12 —
   * חיסכון של מעל 90% ב-Egress, בלי לפגוע בחוויית הזמן-אמת.
   */
  const lastBgSyncRef = useRef(0);
  useEffect(() => {
    const SLOW_SYNC_MS = 300_000; // 5 דק' — סנכרון רקע כש-Realtime בריא
    const id = window.setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState !== 'visible') return;
      const healthy = channelStatusRef.current === 'SUBSCRIBED';
      const elapsed = Date.now() - lastBgSyncRef.current;
      // Realtime בריא ועדיין בתוך חלון הסנכרון האיטי → דלג, חוסך Egress.
      if (healthy && elapsed < SLOW_SYNC_MS) return;
      lastBgSyncRef.current = Date.now();
      void loadInitial({ silent: true });
    }, 30_000);
    return () => window.clearInterval(id);
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

  /**
   * Toast → click: סימון כנקרא, סגירת toast, ופתיחת ה-drawer כדי שהמשתמש
   * יראה את ההתראה במלואה (UX סטנדרטי של iOS — נגיעה ב-banner פותחת).
   */
  const handleToastClick = useCallback(
    (id: string) => {
      const toast = liveToasts.find((t) => t.id === id);
      if (toast && !toast.is_read) {
        void markOne(id, true);
      }
      setLiveToasts((prev) => prev.filter((t) => t.id !== id));
      setOpen(true);
    },
    [liveToasts, markOne]
  );

  const nowMs = useMemo(() => {
    void timeTick;
    void open;
    return Date.now();
  }, [timeTick, open]);

  const showMarkAll = viewMode === 'inbox' && items.some((n) => !n.is_read);

  return (
    <NotificationsDrawerContext.Provider value={ctxValue}>
      {children}

      {/* 🔔 Live toast stack — מופיע על כל המסך, גלובלי. */}
      <LiveToastStack
        toasts={liveToasts}
        almogAvatar={almogAvatar}
        dolevAvatar={dolevAvatar}
        onDismiss={dismissToast}
        onClick={handleToastClick}
      />

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
                      className="shrink-0 inline-flex items-center gap-1 rounded-full bg-emerald-50/95 px-2.5 py-1.5 text-[11px] font-black text-emerald-900 shadow-md shadow-emerald-950/10 ring-1 ring-emerald-100/80 transition active:scale-[0.97]"
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
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-100/80 opacity-75" />
                        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-50 shadow-[0_0_8px_rgba(167,243,208,0.9)]" />
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
                        ? 'bg-emerald-50/95 text-emerald-900 shadow'
                        : 'bg-emerald-950/15 text-white hover:bg-emerald-50/20'
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
                        ? 'bg-emerald-50/95 text-emerald-900 shadow'
                        : 'bg-emerald-950/15 text-white hover:bg-emerald-50/20'
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
                            : 'bg-emerald-950/10 text-white/90 hover:bg-emerald-50/15'
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto bg-gradient-to-b from-emerald-50/70 via-teal-50/40 to-slate-100/60 px-3 sm:px-4 pb-10 pt-3 space-y-2.5 scrollbar-hide text-right">
              {busy && items.length === 0 && (
                <div className="flex items-center justify-center py-16 text-teal-800">
                  <Loader2 className="h-8 w-8 animate-spin opacity-85" />
                </div>
              )}
              {!busy && items.length === 0 && (
                <div className="py-14 text-center px-4 rounded-[20px] mx-0.5 border border-emerald-200/50 bg-gradient-to-br from-emerald-100/50 to-teal-50/60 backdrop-blur-sm">
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
                      ? 'התראות שתעביר לארכיון יופיעו כאן.'
                      : 'תנסה לשנות את הסינון, או תחזור לכאן קצת אחר כך.'}
                  </p>
                </div>
              )}
              {items.map((n) => (
                <NotificationCard
                  key={n.id}
                  notification={n}
                  nowMs={nowMs}
                  viewMode={viewMode}
                  almogAvatar={almogAvatar}
                  dolevAvatar={dolevAvatar}
                  onMarkRead={markOne}
                  onArchive={archiveOne}
                  onUnarchive={unarchiveOne}
                  onCloseDrawer={() => setOpen(false)}
                />
              ))}

              {nextCursor ? (
                <div className="flex justify-center pt-2 pb-6">
                  <button
                    type="button"
                    disabled={loadingMore}
                    onClick={() => void loadMore()}
                    className="inline-flex items-center gap-2 rounded-2xl border border-emerald-300/50 bg-emerald-100/70 px-5 py-2.5 text-sm font-bold text-emerald-900 shadow-sm transition hover:bg-emerald-200/50 disabled:opacity-50"
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
