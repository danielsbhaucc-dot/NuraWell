'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  BookOpen,
  Bot,
  DollarSign,
  FlaskConical,
  Footprints,
  Globe,
  LayoutDashboard,
  Music,
  Sparkles,
  UserCircle,
} from 'lucide-react';
import { OpsPageHeader } from '@/components/admin/OpsPageHeader';
import { OpsGroup, OpsRow } from '@/components/admin/ios/OpsGroup';

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

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0 p-4">
      <p className="text-[13px] font-medium text-slate-500">{label}</p>
      <p className="mt-0.5 font-display text-[1.75rem] font-black tabular-nums leading-tight text-slate-900">{value}</p>
      {sub ? <p className="mt-0.5 truncate text-xs text-slate-500">{sub}</p> : null}
    </div>
  );
}

export function OpsHomeDashboard({ publishedCount, totalSteps }: OpsHomeDashboardProps) {
  const pathname = usePathname() ?? '';
  const opsBase = pathname.startsWith('/ops') ? '/ops' : '';
  const to = (p: string) => `${opsBase}${p}`;

  const [avgCost, setAvgCost] = useState<{ active: number; activeUsers: number } | null>(null);
  useEffect(() => {
    let cancelled = false;
    void fetch('/api/v1/admin/costs?days=30&summary=1')
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
        description="מבט-על מהיר וקיצורי דרך."
      />

      {/* סטטיסטיקות — כרטיס מקובץ אחד עם קווים דקים, כמו בהגדרות של iPhone */}
      <div className="grid grid-cols-2 overflow-hidden rounded-[1.25rem] bg-gc shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.04)] lg:grid-cols-4 [&>*]:border-black/6 [&>*:nth-child(odd)]:border-e [&>*:nth-child(-n+2)]:border-b lg:[&>*]:border-b-0 lg:[&>*:not(:last-child)]:border-e">
        <Stat label="צעדים שפורסמו" value={String(publishedCount)} sub={`מתוך ${totalSteps}`} />
        <Stat label="טיוטות" value={String(Math.max(0, totalSteps - publishedCount))} sub="עוד לא פורסמו" />
        <Stat label="עלות ממוצעת" value={avgCost ? usd(avgCost.active) : '—'} sub="למשתמש פעיל · 30 יום" />
        <Stat label="משתמשים פעילים" value={avgCost ? String(avgCost.activeUsers) : '—'} sub="ב־30 הימים האחרונים" />
      </div>

      <OpsGroup title="אנשים">
        <OpsRow href={to('/users')} icon={UserCircle} tone="emerald" title="משתמשים" desc="פרופילים, מסע וזיכרון אלמוג" />
        <OpsRow href={to('/demo-access')} icon={FlaskConical} tone="amber" title="קישורי דמו" desc="גישה זמנית בלי הרשמה" />
        <OpsRow href={to('/ceo')} icon={Bot} tone="violet" title="גדעון" desc="המנכ״ל הדיגיטלי, אבטחה והעדפות" />
      </OpsGroup>

      <OpsGroup title="תוכן">
        <OpsRow href={to('/journey')} icon={Footprints} tone="cyan" title="מסע וצעדים" desc="תחנות, יצירה, עריכה ופרסום" />
        <OpsRow href={to('/mentors')} icon={Sparkles} tone="violet" title="מנטורים" desc="אלמוג ודולב" />
        <OpsRow href={to('/audio')} icon={Music} tone="rose" title="מוזיקת רקע" desc="פלייליסטים לשיעורים" />
        <OpsRow href={to('/system-rag-ingest')} icon={BookOpen} tone="sky" title="ניהול ידע" desc="מה שאלמוג יודע בשיחות" />
      </OpsGroup>

      <OpsGroup title="מערכת">
        <OpsRow href={to('/costs')} icon={DollarSign} tone="amber" title="עלויות" desc="AI ווידאו פר-משתמש" />
        <OpsRow href={to('/site-settings')} icon={Globe} tone="slate" title="הגדרות אתר" desc="כתובת, רקעים ומסך בקרוב" />
      </OpsGroup>
    </div>
  );
}
