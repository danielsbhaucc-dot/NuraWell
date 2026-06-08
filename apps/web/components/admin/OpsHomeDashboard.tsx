'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  Activity,
  BookOpen,
  DollarSign,
  Footprints,
  Globe,
  LayoutDashboard,
  Map,
  Music,
  Sparkles,
  UserCircle,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { OpsPageHeader } from '@/components/admin/OpsPageHeader';
import { cn } from '@/lib/cn';

type OpsHomeDashboardProps = {
  publishedCount: number;
  totalSteps: number;
};

function usd(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '$0';
  if (n < 0.01) return `$${n.toFixed(4)}`;
  if (n < 1) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(2)}`;
}

type Tone = 'emerald' | 'violet' | 'sky' | 'amber' | 'rose' | 'cyan';

const STAT_TONES: Record<Tone, { wrap: string; icon: string; value: string }> = {
  emerald: { wrap: 'from-emerald-100/70 to-teal-100/50 border-emerald-300/50', icon: 'from-emerald-500 to-teal-600', value: 'text-emerald-900' },
  violet: { wrap: 'from-violet-100/70 to-fuchsia-100/50 border-violet-300/50', icon: 'from-violet-500 to-fuchsia-600', value: 'text-violet-900' },
  sky: { wrap: 'from-sky-100/70 to-cyan-100/50 border-sky-300/50', icon: 'from-sky-500 to-cyan-600', value: 'text-sky-900' },
  amber: { wrap: 'from-amber-100/70 to-orange-100/50 border-amber-300/50', icon: 'from-amber-500 to-orange-600', value: 'text-amber-900' },
  rose: { wrap: 'from-rose-100/70 to-pink-100/50 border-rose-300/50', icon: 'from-rose-500 to-pink-600', value: 'text-rose-900' },
  cyan: { wrap: 'from-cyan-100/70 to-sky-100/50 border-cyan-300/50', icon: 'from-cyan-500 to-sky-600', value: 'text-cyan-900' },
};

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  sub?: string;
  tone: Tone;
}) {
  const t = STAT_TONES[tone];
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-3xl border bg-gradient-to-br p-4 shadow-[0_12px_36px_rgba(15,23,42,0.08)] backdrop-blur-xl sm:p-5',
        t.wrap,
      )}
    >
      <div className="pointer-events-none absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent" />
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-700/85">{label}</p>
          <p className={cn('mt-1 font-display text-3xl font-black tabular-nums', t.value)}>{value}</p>
          {sub ? <p className="mt-1.5 text-[11px] leading-relaxed text-slate-600">{sub}</p> : null}
        </div>
        <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-md ring-1 ring-white/50', t.icon)}>
          <Icon className="h-5 w-5" aria-hidden />
        </span>
      </div>
    </div>
  );
}

const LINK_TONES: Record<Tone, { icon: string; hover: string }> = {
  emerald: { icon: 'from-emerald-500 to-teal-600', hover: 'hover:border-emerald-400/60 hover:shadow-[0_14px_40px_rgba(16,185,129,0.2)]' },
  violet: { icon: 'from-violet-500 to-fuchsia-600', hover: 'hover:border-violet-400/60 hover:shadow-[0_14px_40px_rgba(139,92,246,0.2)]' },
  sky: { icon: 'from-sky-500 to-cyan-600', hover: 'hover:border-sky-400/60 hover:shadow-[0_14px_40px_rgba(14,165,233,0.2)]' },
  amber: { icon: 'from-amber-500 to-orange-600', hover: 'hover:border-amber-400/60 hover:shadow-[0_14px_40px_rgba(245,158,11,0.2)]' },
  rose: { icon: 'from-rose-500 to-pink-600', hover: 'hover:border-rose-400/60 hover:shadow-[0_14px_40px_rgba(244,63,94,0.2)]' },
  cyan: { icon: 'from-cyan-500 to-sky-600', hover: 'hover:border-cyan-400/60 hover:shadow-[0_14px_40px_rgba(6,182,212,0.2)]' },
};

function QuickLink({
  href,
  icon: Icon,
  title,
  desc,
  tone,
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  desc: string;
  tone: Tone;
}) {
  const t = LINK_TONES[tone];
  return (
    <Link
      href={href}
      className={cn(
        'group flex items-center gap-3 rounded-3xl border border-white/60 bg-white/45 p-4 shadow-[0_10px_30px_rgba(99,102,241,0.07)] backdrop-blur-xl transition-all active:scale-[0.99]',
        t.hover,
      )}
    >
      <span className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-md ring-1 ring-white/50 transition-transform group-hover:scale-105', t.icon)}>
        <Icon className="h-6 w-6" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="font-display text-[15px] font-black text-slate-900">{title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-slate-600">{desc}</p>
      </div>
    </Link>
  );
}

export function OpsHomeDashboard({ publishedCount, totalSteps }: OpsHomeDashboardProps) {
  const pathname = usePathname() ?? '';
  const opsBase = pathname.startsWith('/ops') ? '/ops' : '';
  const to = (p: string) => `${opsBase}${p}`;

  const [avgCost, setAvgCost] = useState<{ active: number; activeUsers: number } | null>(null);
  useEffect(() => {
    let cancelled = false;
    void fetch('/api/v1/admin/costs?days=30', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d) return;
        setAvgCost({
          active: d.averagePerActiveUser?.totalUsd ?? 0,
          activeUsers: d.activeUsers ?? 0,
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-5 sm:space-y-6">
      <OpsPageHeader
        icon={LayoutDashboard}
        eyebrow="לוח בקרה"
        title="ראשי"
        tone="emerald"
        description="מבט-על מהיר על המסע, העלויות והקהילה — וקיצורי דרך לכל אזורי הניהול."
      />

      {/* סטטיסטיקות */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={Footprints} label="צעדים במסע" value={String(totalSteps)} sub={`${publishedCount} פורסמו ללקוחות`} tone="cyan" />
        <StatCard icon={Activity} label="פורסמו" value={String(publishedCount)} sub="זמינים למשתמשים" tone="emerald" />
        <StatCard
          icon={DollarSign}
          label="עלות ממוצעת"
          value={avgCost ? usd(avgCost.active) : '—'}
          sub={avgCost ? 'למשתמש פעיל · 30 יום' : 'טוען נתונים...'}
          tone="amber"
        />
        <StatCard
          icon={Users}
          label="משתמשים פעילים"
          value={avgCost ? String(avgCost.activeUsers) : '—'}
          sub="ב־30 הימים האחרונים"
          tone="violet"
        />
      </div>

      {/* קיצורי דרך */}
      <div>
        <p className="mb-3 px-1 text-sm font-bold text-slate-500">ניהול מהיר</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <QuickLink href={to('/users')} icon={UserCircle} title="משתמשים" desc="פרופילים, מסע וזיכרון אלמוג" tone="emerald" />
          <QuickLink href={to('/costs')} icon={DollarSign} title="עלויות" desc="פירוק עלות AI ווידאו פר-משתמש" tone="amber" />
          <QuickLink href={to('/journey-hub')} icon={Map} title="מסע ותחנות" desc="קיבוץ צעדים לתחנות" tone="rose" />
          <QuickLink href={to('/journey')} icon={Footprints} title="רשימת צעדים" desc="יצירה, עריכה ופרסום" tone="cyan" />
          <QuickLink href={to('/audio')} icon={Music} title="מוזיקת רקע" desc="פלייליסטים לשיעורים" tone="violet" />
          <QuickLink href={to('/mentors')} icon={Sparkles} title="מנטורים" desc="תמונות פרופיל של אלמוג ודולב" tone="violet" />
          <QuickLink href={to('/system-rag-ingest')} icon={BookOpen} title="ניהול ידע" desc="מה שאלמוג יודע בשיחות" tone="sky" />
          <QuickLink href={to('/site-settings')} icon={Globe} title="הגדרות אתר" desc="כתובת, רקעים ומסך בקרוב" tone="sky" />
        </div>
      </div>
    </div>
  );
}
