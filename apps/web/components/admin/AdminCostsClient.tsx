'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Loader2,
  Search,
  UserCircle,
  DollarSign,
  MessageSquare,
  Bell,
  Video,
  Users,
  TrendingUp,
} from 'lucide-react';

type Breakdown = {
  chatUsd: number;
  notificationsUsd: number;
  videoUsd: number;
  totalUsd: number;
};

type Counts = {
  chatMessages: number;
  notifications: number;
  notificationsEstimated: number;
  videoViews: number;
  videoSeconds: number;
};

type Pricing = { bunnyMinutesPerView: number; bunnyUsdPerMinute: number };

type AggregateResp = {
  scope: 'aggregate';
  days: number;
  pricing: Pricing;
  totalUsers: number;
  activeUsers: number;
  totals: Breakdown;
  averagePerUser: Breakdown;
  averagePerActiveUser: Breakdown;
  topUsers: Array<{ userId: string; fullName: string | null; breakdown: Breakdown; counts: Counts }>;
};

type UserResp = {
  scope: 'user';
  userId: string;
  days: number;
  pricing: Pricing;
  breakdown: Breakdown;
  counts: Counts;
};

type UserRow = { id: string; full_name: string | null; email: string | null };

const WINDOWS = [
  { days: 7, label: '7 ימים' },
  { days: 30, label: '30 יום' },
  { days: 90, label: '90 יום' },
];

function usd(n: number): string {
  if (!Number.isFinite(n)) return '$0';
  if (n === 0) return '$0';
  if (n < 0.01) return `$${n.toFixed(4)}`;
  if (n < 1) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(2)}`;
}

function CostCard({
  label,
  value,
  icon,
  tone,
  sub,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone: 'emerald' | 'violet' | 'sky' | 'amber';
  sub?: string;
}) {
  const toneClass = {
    emerald: 'border-emerald-300/50 from-emerald-100/70 to-teal-100/50 text-emerald-700',
    violet: 'border-violet-300/45 from-violet-100/60 to-fuchsia-50/45 text-violet-700',
    sky: 'border-sky-300/50 from-cyan-100/70 to-sky-100/50 text-sky-700',
    amber: 'border-amber-300/50 from-amber-100/60 to-orange-50/45 text-amber-700',
  }[tone];
  return (
    <div className={`rounded-2xl border bg-gradient-to-br ${toneClass} p-4 backdrop-blur-xl`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-700/85">{label}</p>
          <p className="mt-1 font-display text-2xl font-black tabular-nums text-slate-900">{value}</p>
          {sub ? <p className="mt-1 text-[11px] text-slate-600">{sub}</p> : null}
        </div>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/60 bg-white/55 shadow-sm">
          {icon}
        </div>
      </div>
    </div>
  );
}

function BreakdownBars({ b }: { b: Breakdown }) {
  const total = b.totalUsd || 1;
  const pct = (v: number) => `${Math.round((v / total) * 100)}%`;
  const parts = [
    { label: 'צ׳אט', v: b.chatUsd, color: 'bg-emerald-500' },
    { label: 'התראות', v: b.notificationsUsd, color: 'bg-violet-500' },
    { label: 'וידאו', v: b.videoUsd, color: 'bg-sky-500' },
  ];
  return (
    <div className="space-y-2">
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100">
        {parts.map((p) => (
          <div key={p.label} className={p.color} style={{ width: pct(p.v) }} title={`${p.label} ${usd(p.v)}`} />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        {parts.map((p) => (
          <div key={p.label}>
            <p className="font-bold text-slate-800">{usd(p.v)}</p>
            <p className="text-slate-500">{p.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AdminCostsClient() {
  const [days, setDays] = useState(30);
  const [agg, setAgg] = useState<AggregateResp | null>(null);
  const [aggLoading, setAggLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [q, setQ] = useState('');
  const [list, setList] = useState<UserRow[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedName, setSelectedName] = useState<string>('');
  const [userCost, setUserCost] = useState<UserResp | null>(null);
  const [userLoading, setUserLoading] = useState(false);

  const loadAggregate = useCallback(async (windowDays: number) => {
    setAggLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/admin/costs?days=${windowDays}`, { cache: 'no-store' });
      const data = (await res.json()) as AggregateResp & { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'שגיאה');
      setAgg(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאת טעינה');
      setAgg(null);
    } finally {
      setAggLoading(false);
    }
  }, []);

  const loadList = useCallback(async (search: string) => {
    setListLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('q', search.trim());
      const res = await fetch(`/api/v1/admin/users?${params}`, { cache: 'no-store' });
      const data = (await res.json()) as { users?: UserRow[] };
      setList(data.users ?? []);
    } catch {
      setList([]);
    } finally {
      setListLoading(false);
    }
  }, []);

  const loadUserCost = useCallback(async (userId: string, windowDays: number) => {
    setUserLoading(true);
    try {
      const res = await fetch(`/api/v1/admin/costs?userId=${userId}&days=${windowDays}`, {
        cache: 'no-store',
      });
      const data = (await res.json()) as UserResp & { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'שגיאה');
      setUserCost(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאת טעינה');
      setUserCost(null);
    } finally {
      setUserLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAggregate(days);
  }, [days, loadAggregate]);

  useEffect(() => {
    const t = setTimeout(() => void loadList(q), 280);
    return () => clearTimeout(t);
  }, [q, loadList]);

  useEffect(() => {
    if (selectedId) void loadUserCost(selectedId, days);
    else setUserCost(null);
  }, [selectedId, days, loadUserCost]);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black text-slate-900">
            <DollarSign className="h-6 w-6 text-emerald-600" />
            עלויות משתמשים
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            עלות AI (צ׳אט + התראות) וצפיות וידאו (Bunny) פר-משתמש, לפי הנתונים שנרשמו ב-Supabase.
          </p>
        </div>
        <div className="flex gap-1 rounded-xl border border-slate-200 bg-white/70 p-1">
          {WINDOWS.map((w) => (
            <button
              key={w.days}
              type="button"
              onClick={() => setDays(w.days)}
              className={[
                'rounded-lg px-3 py-1.5 text-xs font-bold transition-colors',
                days === w.days ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-100',
              ].join(' ')}
            >
              {w.label}
            </button>
          ))}
        </div>
      </header>

      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
          {error}
        </p>
      ) : null}

      {/* סיכום אגרגטיבי */}
      {aggLoading ? (
        <p className="flex justify-center py-10">
          <Loader2 className="h-7 w-7 animate-spin text-emerald-600" />
        </p>
      ) : agg ? (
        <section className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <CostCard
              label="ממוצע למשתמש פעיל"
              value={usd(agg.averagePerActiveUser.totalUsd)}
              icon={<TrendingUp className="h-4 w-4 text-emerald-600" />}
              tone="emerald"
              sub={`${agg.activeUsers} פעילים מתוך ${agg.totalUsers}`}
            />
            <CostCard
              label="ממוצע לכלל המשתמשים"
              value={usd(agg.averagePerUser.totalUsd)}
              icon={<Users className="h-4 w-4 text-violet-600" />}
              tone="violet"
              sub={`${agg.totalUsers} משתמשים רשומים`}
            />
            <CostCard
              label={`סך עלות (${agg.days} ימים)`}
              value={usd(agg.totals.totalUsd)}
              icon={<DollarSign className="h-4 w-4 text-sky-600" />}
              tone="sky"
            />
            <CostCard
              label="מחיר Bunny לצפייה"
              value={usd(agg.pricing.bunnyMinutesPerView * agg.pricing.bunnyUsdPerMinute)}
              icon={<Video className="h-4 w-4 text-amber-600" />}
              tone="amber"
              sub={`${agg.pricing.bunnyMinutesPerView} דק' × צפייה`}
            />
          </div>

          <div className="rounded-2xl border border-white/80 bg-white/60 p-4 backdrop-blur-xl">
            <p className="mb-3 text-sm font-bold text-slate-700">פירוק סך העלות לפי מקור</p>
            <BreakdownBars b={agg.totals} />
          </div>
        </section>
      ) : null}

      {/* בחירת משתמש + פירוק */}
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,320px)_1fr]">
        <section className="flex max-h-[60vh] flex-col overflow-hidden rounded-2xl border border-white/80 bg-white/60 backdrop-blur-xl">
          <div className="border-b border-slate-100 p-3">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="חיפוש משתמש..."
                className="w-full rounded-xl border border-slate-200 bg-white/80 py-2 pr-10 pl-3 text-sm"
                dir="rtl"
              />
            </div>
          </div>
          {listLoading ? (
            <p className="flex justify-center p-6">
              <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
            </p>
          ) : (
            <ul className="flex-1 divide-y divide-slate-100 overflow-y-auto">
              {list.map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedId(u.id);
                      setSelectedName(u.full_name || u.email || 'משתמש');
                    }}
                    className={[
                      'w-full px-4 py-3 text-right transition-colors hover:bg-emerald-50/80',
                      selectedId === u.id ? 'bg-emerald-50' : '',
                    ].join(' ')}
                  >
                    <p className="text-sm font-bold text-slate-900">{u.full_name || 'ללא שם'}</p>
                    <p className="truncate text-xs text-slate-500">{u.email ?? u.id}</p>
                  </button>
                </li>
              ))}
              {list.length === 0 ? (
                <li className="p-6 text-center text-sm text-slate-500">לא נמצאו משתמשים</li>
              ) : null}
            </ul>
          )}
        </section>

        <section className="min-h-[280px] rounded-2xl border border-white/80 bg-white/60 p-4 backdrop-blur-xl sm:p-5">
          {!selectedId ? (
            <div className="space-y-4">
              <p className="flex items-center justify-center gap-2 py-6 text-sm text-slate-500">
                <UserCircle className="h-5 w-5" />
                בחר/י משתמש כדי לראות פירוק עלות
              </p>
              {agg && agg.topUsers.length > 0 ? (
                <div>
                  <p className="mb-2 text-xs font-bold text-slate-500">המשתמשים היקרים ביותר</p>
                  <ul className="divide-y divide-slate-100">
                    {agg.topUsers.map((u) => (
                      <li key={u.userId}>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedId(u.userId);
                            setSelectedName(u.fullName || 'משתמש');
                          }}
                          className="flex w-full items-center justify-between gap-3 px-1 py-2 text-right hover:bg-slate-50"
                        >
                          <span className="truncate text-sm text-slate-700">{u.fullName || u.userId}</span>
                          <span className="shrink-0 font-bold tabular-nums text-emerald-700">
                            {usd(u.breakdown.totalUsd)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : userLoading ? (
            <p className="flex justify-center py-16">
              <Loader2 className="h-7 w-7 animate-spin text-emerald-600" />
            </p>
          ) : userCost ? (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-black text-slate-900">{selectedName}</h2>
                <p className="text-sm text-slate-600">סה״כ עלות ב-{userCost.days} הימים האחרונים</p>
                <p className="mt-1 font-display text-3xl font-black tabular-nums text-emerald-700">
                  {usd(userCost.breakdown.totalUsd)}
                </p>
              </div>

              <BreakdownBars b={userCost.breakdown} />

              <div className="grid gap-2 sm:grid-cols-3">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-800">
                    <MessageSquare className="h-3.5 w-3.5" /> צ׳אט
                  </p>
                  <p className="mt-1 font-bold tabular-nums text-slate-900">{usd(userCost.breakdown.chatUsd)}</p>
                  <p className="text-[11px] text-slate-500">{userCost.counts.chatMessages} הודעות</p>
                </div>
                <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-3">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-violet-800">
                    <Bell className="h-3.5 w-3.5" /> התראות
                  </p>
                  <p className="mt-1 font-bold tabular-nums text-slate-900">
                    {usd(userCost.breakdown.notificationsUsd)}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {userCost.counts.notifications} התראות
                    {userCost.counts.notificationsEstimated > 0
                      ? ` · ${userCost.counts.notificationsEstimated} באומדן`
                      : ''}
                  </p>
                </div>
                <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-3">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-sky-800">
                    <Video className="h-3.5 w-3.5" /> וידאו (Bunny)
                  </p>
                  <p className="mt-1 font-bold tabular-nums text-slate-900">{usd(userCost.breakdown.videoUsd)}</p>
                  <p className="text-[11px] text-slate-500">
                    {userCost.counts.videoViews} צפיות · {Math.round(userCost.counts.videoSeconds / 60)} דק׳
                  </p>
                </div>
              </div>

              <p className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-500">
                העלויות מבוססות על מחירון הספקים שמוגדר ב-cost-model. התראות ללא טוקנים מתועדים מחושבות
                באומדן. צפיות וידאו מתומחרות לפי {userCost.pricing.bunnyMinutesPerView} דק׳ לצפייה ×{' '}
                {usd(userCost.pricing.bunnyUsdPerMinute)} לדקה.
              </p>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
